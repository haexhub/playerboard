import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapPlayerStats } from '~/server/utils/veo/mapPlayerStats'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/veo/analysis-stats-player-response.json', 'utf-8'),
)

const MATCH_ID = 'a1b2c3d4-0000-0000-0000-000000000000'
const ROSTER = [
  { id: 'player-7', jerseyNumber: 7 },
  { id: 'player-10', jerseyNumber: 10 },
]

describe('mapPlayerStats', () => {
  it('maps every curated stat for a jersey number matching the active roster', () => {
    const rows = mapPlayerStats(fixture, MATCH_ID, ROSTER)

    const jersey7 = rows.filter((r) => r.veoJerseyNumber === 7)
    expect(jersey7.every((r) => r.matchId === MATCH_ID)).toBe(true)
    expect(jersey7.every((r) => r.playerId === 'player-7')).toBe(true)
    expect(jersey7).toHaveLength(9) // 9 curated types present for jersey 7 in the fixture

    const goal = jersey7.find((r) => r.statType === 'football_goal_total')
    expect(goal).toMatchObject({ category: 'attacking', value: 1 })
  })

  it('still returns rows for a jersey number with no active-roster match, with playerId null', () => {
    const rows = mapPlayerStats(fixture, MATCH_ID, ROSTER)

    const jersey99 = rows.filter((r) => r.veoJerseyNumber === 99)
    expect(jersey99).toHaveLength(2)
    expect(jersey99.every((r) => r.playerId === null)).toBe(true)
  })

  it('drops a stat type outside the nine curated types', () => {
    const rows = mapPlayerStats(fixture, MATCH_ID, ROSTER)

    expect(rows.some((r) => r.statType === 'football_touches_total')).toBe(false)
  })

  it('rejects non-numeric jersey numbers while accepting leading zeroes', () => {
    expect(() =>
      mapPlayerStats({ items: [{ jersey_number: '7x', stats: [] }] }, MATCH_ID, ROSTER),
    ).toThrow('Unexpected Veo player-stats response shape')
    expect(() =>
      mapPlayerStats({ items: [{ jersey_number: '7\n', stats: [] }] }, MATCH_ID, ROSTER),
    ).toThrow('Unexpected Veo player-stats response shape')

    expect(
      mapPlayerStats(
        { items: [{ jersey_number: '07', stats: [{ value: 1, type: 'sprints_total' }] }] },
        MATCH_ID,
        ROSTER,
      ),
    ).toMatchObject([{ veoJerseyNumber: 7, playerId: 'player-7', statType: 'sprints_total' }])
  })

  it('skips jersey numbers outside the safe integer range', () => {
    expect(
      mapPlayerStats(
        {
          items: [
            {
              jersey_number: '9'.repeat(400),
              stats: [{ value: 1, type: 'sprints_total' }],
            },
          ],
        },
        MATCH_ID,
        ROSTER,
      ),
    ).toEqual([])
  })

  it('ignores inherited stat keys', () => {
    const rows = mapPlayerStats(
      {
        items: [
          {
            jersey_number: '7',
            stats: [
              { value: 1, type: 'toString' },
              { value: 2, type: '__proto__' },
              { value: 3, type: 'sprints_total' },
            ],
          },
        ],
      },
      MATCH_ID,
      ROSTER,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.statType).toBe('sprints_total')
  })

  it('keeps only the first row for a duplicate jersey/stat key', () => {
    const payload = {
      items: [
        {
          jersey_number: '7',
          stats: [{ value: 27.8, type: 'top_speed_kmh' }],
        },
        {
          jersey_number: '07',
          stats: [{ value: 26.1, type: 'top_speed_kmh' }],
        },
      ],
    }

    expect(mapPlayerStats(payload, MATCH_ID, ROSTER)).toEqual([
      {
        matchId: MATCH_ID,
        veoJerseyNumber: 7,
        statType: 'top_speed_kmh',
        playerId: 'player-7',
        category: 'physical',
        value: 27.8,
      },
    ])
  })

  it('maps an empty item list to no rows', () => {
    expect(mapPlayerStats({ items: [] }, MATCH_ID, ROSTER)).toEqual([])
  })

  it('throws on a malformed/unexpected payload shape', () => {
    expect(() => mapPlayerStats({ unexpected: true }, MATCH_ID, ROSTER)).toThrow()
    expect(() => mapPlayerStats(null, MATCH_ID, ROSTER)).toThrow()
    expect(() =>
      mapPlayerStats({ items: [{ jersey_number: 7, stats: [] }] }, MATCH_ID, ROSTER),
    ).toThrow()
  })
})
