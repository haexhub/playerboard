// @vitest-environment node

import 'dotenv/config'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runIsolated } from './helpers/rollback'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

let sql: ReturnType<typeof postgres>

beforeAll(() => {
  sql = postgres(DB_URL, { max: 1, prepare: false })
})

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const asUser = (tx: postgres.TransactionSql, userId: string) =>
  Promise.all([
    tx`select set_config('role', 'authenticated', true)`,
    tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`,
  ])

describe('deleting a training', () => {
  it('cascades to its point entries and photo rows, even while saved with a single photo', async () => {
    const remaining = await runIsolated(sql, async (tx) => {
      const trainerId = crypto.randomUUID()
      const teamId = crypto.randomUUID()
      await tx`insert into auth.users (id) values (${trainerId})`
      await tx`insert into public.teams (id, name, slug) values (${teamId}, 'Del Team', ${'del-' + trainerId.slice(0, 8)})`
      await tx`insert into public.memberships (user_id, team_id, role) values (${trainerId}, ${teamId}, 'trainer')`

      const playerId = crypto.randomUUID()
      const catId = crypto.randomUUID()
      await tx`insert into public.players (id, team_id, name, active) values (${playerId}, ${teamId}, 'P', true)`
      await tx`insert into public.point_categories (id, team_id, name, active, sort_order, value_min, value_max)
               values (${catId}, ${teamId}, 'Einsatz', true, 1, 0, 10)`

      const today = new Date().toISOString().slice(0, 10)
      const trainingId = crypto.randomUUID()
      const photoId = crypto.randomUUID()
      await tx`insert into public.trainings (id, team_id, date, status) values (${trainingId}, ${teamId}, ${today}, 'draft')`
      await tx`insert into public.training_photos (id, training_id, storage_path, content_type, size_bytes, uploaded_by)
               values (${photoId}, ${trainingId}, ${teamId + '/' + trainingId + '/' + photoId + '.jpg'}, 'image/jpeg', 100, ${trainerId})`
      await tx`insert into public.point_entries (training_id, player_id, category_id, value)
               values (${trainingId}, ${playerId}, ${catId}, 5)`
      // Only one photo, so this only succeeds because it is the transition into
      // 'saved', not a later removal of the last photo.
      await tx`update public.trainings set status = 'saved' where id = ${trainingId}`

      await asUser(tx, trainerId)
      await tx`delete from public.trainings where id = ${trainingId}`

      const [entries, photos, training] = await Promise.all([
        tx`select 1 from public.point_entries where training_id = ${trainingId}`,
        tx`select 1 from public.training_photos where training_id = ${trainingId}`,
        tx`select 1 from public.trainings where id = ${trainingId}`,
      ])
      return { entries, photos, training }
    })

    expect(remaining.training).toHaveLength(0)
    expect(remaining.entries).toHaveLength(0)
    expect(remaining.photos).toHaveLength(0)
  })

  it('is refused by RLS for a non-trainer member', async () => {
    const outcome = await runIsolated(sql, async (tx) => {
      const trainerId = crypto.randomUUID()
      const playerUserId = crypto.randomUUID()
      const teamId = crypto.randomUUID()
      await tx`insert into auth.users (id) values (${trainerId}), (${playerUserId})`
      await tx`insert into public.teams (id, name, slug) values (${teamId}, 'Del Team 2', ${'del2-' + trainerId.slice(0, 8)})`
      await tx`insert into public.memberships (user_id, team_id, role) values
               (${trainerId}, ${teamId}, 'trainer'), (${playerUserId}, ${teamId}, 'player')`

      const today = new Date().toISOString().slice(0, 10)
      const trainingId = crypto.randomUUID()
      await tx`insert into public.trainings (id, team_id, date, status) values (${trainingId}, ${teamId}, ${today}, 'saved')`

      await asUser(tx, playerUserId)
      const deleted = await tx`delete from public.trainings where id = ${trainingId} returning id`
      return deleted
    })

    expect(outcome).toHaveLength(0)
  })
})
