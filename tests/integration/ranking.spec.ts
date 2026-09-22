// @vitest-environment node

import 'dotenv/config'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

let sql: ReturnType<typeof postgres>

beforeAll(() => {
  sql = postgres(DB_URL, { max: 1, prepare: false })
})

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

type RankingResult = {
  team_id: string
  from: string
  to: string
  categories: Array<{ id: string; name: string; sort_order: number }>
  rows: Array<{
    rank_position: number
    player_id: string
    name: string
    jersey_number: number | null
    scores: Record<string, number>
  }>
}

class Rollback extends Error {}

const runIsolated = async <T>(work: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> => {
  let out!: T
  try {
    await sql.begin(async (tx) => {
      out = await work(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  return out
}

describe('get_team_ranking', () => {
  it('produces the (1, 2, 2, 4) tie pattern under lexicographic category order', async () => {
    const ranking = await runIsolated<RankingResult>(async (tx) => {
      const userId = crypto.randomUUID()
      const teamId = crypto.randomUUID()

      await tx`insert into auth.users (id) values (${userId})`
      await tx`insert into public.teams (id, name, slug, created_by, last_updated_by)
               values (${teamId}, 'Ranking Test', ${'ranking-test-' + userId.slice(0, 8)}, ${userId}, ${userId})`
      await tx`insert into public.memberships (user_id, team_id, role)
               values (${userId}, ${teamId}, 'trainer')`

      const c1 = crypto.randomUUID()
      const c2 = crypto.randomUUID()
      await tx`insert into public.point_categories (id, team_id, name, active, sort_order, value_min, value_max, created_by, last_updated_by)
               values
                 (${c1}, ${teamId}, 'Einsatz',  true, 1, 0, 100, ${userId}, ${userId}),
                 (${c2}, ${teamId}, 'Technik',  true, 2, 0, 100, ${userId}, ${userId})`

      const players = [
        { name: 'Alpha', jersey: 1 },
        { name: 'Beta', jersey: 2 },
        { name: 'Charlie', jersey: 3 },
        { name: 'Delta', jersey: 4 },
      ].map((p) => ({ ...p, id: crypto.randomUUID() }))
      for (const p of players) {
        await tx`insert into public.players (id, team_id, name, jersey_number, active, photo_consent, created_by, last_updated_by)
                 values (${p.id}, ${teamId}, ${p.name}, ${p.jersey}, true, true, ${userId}, ${userId})`
      }

      const today = new Date().toISOString().slice(0, 10)
      const trainingId = crypto.randomUUID()
      const photoId = crypto.randomUUID()
      await tx`insert into public.trainings (id, team_id, date, status, created_by, last_updated_by)
               values (${trainingId}, ${teamId}, ${today}, 'draft', ${userId}, ${userId})`
      await tx`insert into public.training_photos (id, training_id, storage_path, content_type, size_bytes, uploaded_by)
               values (${photoId}, ${trainingId}, ${teamId + '/' + trainingId + '/' + photoId + '.jpg'}, 'image/jpeg', 100, ${userId})`
      await tx`update public.trainings set status='saved' where id=${trainingId}`

      // Vector [c1, c2] descending, rank pattern (1, 2, 2, 4):
      //   Alpha:   [10, 5]  -> rank 1
      //   Beta:    [ 8, 7]  -> rank 2
      //   Charlie: [ 8, 7]  -> rank 2 (tied)
      //   Delta:   [ 8, 6]  -> rank 4
      const entries: Array<[string, string, number]> = [
        [players[0]!.id, c1, 10],
        [players[0]!.id, c2, 5],
        [players[1]!.id, c1, 8],
        [players[1]!.id, c2, 7],
        [players[2]!.id, c1, 8],
        [players[2]!.id, c2, 7],
        [players[3]!.id, c1, 8],
        [players[3]!.id, c2, 6],
      ]
      for (const [playerId, categoryId, value] of entries) {
        await tx`insert into public.point_entries (training_id, player_id, category_id, value, created_by, last_updated_by)
                 values (${trainingId}, ${playerId}, ${categoryId}, ${value}, ${userId}, ${userId})`
      }

      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
      const [row] = await tx<[{ get_team_ranking: RankingResult }]>`
        select public.get_team_ranking(${teamId}::uuid, ${today}::date, ${today}::date)
      `
      return row!.get_team_ranking
    })

    expect(ranking).toBeTruthy()
    expect(ranking.rows).toHaveLength(4)
    expect(ranking.categories).toHaveLength(2)

    const byName = new Map(ranking.rows.map((r) => [r.name, r]))
    expect(byName.get('Alpha')?.rank_position).toBe(1)
    expect(byName.get('Beta')?.rank_position).toBe(2)
    expect(byName.get('Charlie')?.rank_position).toBe(2)
    expect(byName.get('Delta')?.rank_position).toBe(4)

    const ranks = ranking.rows.map((r) => r.rank_position).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 2, 4])

    const ordered = [...ranking.rows].sort(
      (a, b) =>
        a.rank_position - b.rank_position || (a.jersey_number ?? 999) - (b.jersey_number ?? 999),
    )
    expect(ranking.rows).toEqual(ordered)
  })

  it('returns zero-score rows for players with no entries in the timeframe', async () => {
    const { ranking, catId } = await runIsolated(async (tx) => {
      const userId = crypto.randomUUID()
      const teamId = crypto.randomUUID()
      await tx`insert into auth.users (id) values (${userId})`
      await tx`insert into public.teams (id, name, slug, created_by, last_updated_by)
               values (${teamId}, 'Empty Team', ${'empty-' + userId.slice(0, 8)}, ${userId}, ${userId})`
      await tx`insert into public.memberships (user_id, team_id, role)
               values (${userId}, ${teamId}, 'trainer')`
      const catId = crypto.randomUUID()
      await tx`insert into public.point_categories (id, team_id, name, active, sort_order, value_min, value_max, created_by, last_updated_by)
               values (${catId}, ${teamId}, 'Solo', true, 1, 0, 10, ${userId}, ${userId})`
      const pid = crypto.randomUUID()
      await tx`insert into public.players (id, team_id, name, jersey_number, active, photo_consent, created_by, last_updated_by)
               values (${pid}, ${teamId}, 'Solo P', null, true, true, ${userId}, ${userId})`

      const today = new Date().toISOString().slice(0, 10)
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
      const [row] = await tx<[{ get_team_ranking: RankingResult }]>`
        select public.get_team_ranking(${teamId}::uuid, ${today}::date, ${today}::date)
      `
      return { ranking: row!.get_team_ranking, catId }
    })

    expect(ranking.rows).toHaveLength(1)
    expect(ranking.rows[0]!.rank_position).toBe(1)
    expect(ranking.rows[0]!.scores[catId]).toBe(0)
  })
})
