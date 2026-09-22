// @vitest-environment node

import 'dotenv/config'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuthUser, runIsolated } from './helpers/rollback'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

let sql: ReturnType<typeof postgres>

beforeAll(() => {
  sql = postgres(DB_URL, { max: 1, prepare: false })
})

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const foundTeam = async (tx: postgres.TransactionSql, userId: string) => {
  const slug = `del-${crypto.randomUUID().slice(0, 8)}`
  await tx`select public.create_team_with_trainer('Del', ${slug}, ${userId}::uuid)`
  const [team] = await tx<{ id: string }[]>`select id from public.teams where slug = ${slug}`
  return team!.id
}

// POST /api/profile/delete refuses the same cases with a readable message, but
// the guard has to hold for anything that reaches the database another way.
describe('deleting an account is refused while a team would lose its last trainer', () => {
  it('refuses to delete the sole trainer of a team', async () => {
    const outcome = await runIsolated(sql, async (tx) => {
      const userId = await createAuthUser(tx)
      await foundTeam(tx, userId)
      try {
        await tx`delete from auth.users where id = ${userId}`
        return 'deleted'
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(outcome).toMatch(/at least one trainer/i)
  })

  it('refuses even when the team has other members who are not trainers', async () => {
    const outcome = await runIsolated(sql, async (tx) => {
      const trainerId = await createAuthUser(tx)
      const playerId = await createAuthUser(tx)
      const teamId = await foundTeam(tx, trainerId)
      await tx`insert into public.memberships (user_id, team_id, role)
               values (${playerId}, ${teamId}, 'player')`
      try {
        await tx`delete from auth.users where id = ${trainerId}`
        return 'deleted'
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(outcome).toMatch(/at least one trainer/i)
  })

  it('allows the deletion once the role was handed over', async () => {
    const remaining = await runIsolated(sql, async (tx) => {
      const trainerId = await createAuthUser(tx)
      const successorId = await createAuthUser(tx)
      const teamId = await foundTeam(tx, trainerId)
      await tx`insert into public.memberships (user_id, team_id, role)
               values (${successorId}, ${teamId}, 'trainer')`
      await tx`delete from auth.users where id = ${trainerId}`
      return tx<{ user_id: string; role: string }[]>`
        select user_id, role from public.memberships where team_id = ${teamId}`
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.role).toBe('trainer')
  })

  it('allows deleting the team itself, which leaves no team needing a trainer', async () => {
    const teamsLeft = await runIsolated(sql, async (tx) => {
      const userId = await createAuthUser(tx)
      const teamId = await foundTeam(tx, userId)
      await tx`delete from public.teams where id = ${teamId}`
      await tx`delete from auth.users where id = ${userId}`
      return tx`select id from public.teams where id = ${teamId}`
    })
    expect(teamsLeft).toHaveLength(0)
  })

  it('allows the Auth cascade for a team recorded as pending deletion', async () => {
    const remaining = await runIsolated(sql, async (tx) => {
      const userId = await createAuthUser(tx)
      const teamId = await foundTeam(tx, userId)
      await tx`insert into public.pending_account_deletions (user_id, team_id)
               values (${userId}, ${teamId})`
      await tx`delete from auth.users where id = ${userId}`
      return tx<{ id: string }[]>`select id from public.teams where id = ${teamId}`
    })
    expect(remaining).toHaveLength(1)
  })
})
