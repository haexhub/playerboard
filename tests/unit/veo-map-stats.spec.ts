import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapAnalysisStatsToRows } from '~/server/utils/veo/mapStats'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/veo/analysis-stats-response.json', 'utf-8'),
)

const MATCH_ID = 'a1b2c3d4-0000-0000-0000-000000000000'

describe('mapAnalysisStatsToRows', () => {
  it('maps every stat entry for both team associations', () => {
    const rows = mapAnalysisStatsToRows(fixture, MATCH_ID)

    expect(rows).toHaveLength(28) // 14 categories x own + opponent
    expect(rows.every((r) => r.matchId === MATCH_ID)).toBe(true)

    const ownGoals = rows.find(
      (r) => r.teamAssociation === 'own' && r.statType === 'football_goal_total',
    )
    expect(ownGoals).toMatchObject({
      category: 'attacking',
      value: 2,
      periodValues: [
        { period: 1, value: 0 },
        { period: 2, value: 2 },
      ],
    })

    const opponentSaves = rows.find(
      (r) => r.teamAssociation === 'opponent' && r.statType === 'football_save_total',
    )
    expect(opponentSaves).toMatchObject({ category: 'goalkeeping', value: 5 })
  })

  it('does not fabricate a row for a category Veo did not return', () => {
    const partial = {
      items: [
        {
          team_association: 'own',
          stats: [
            {
              category: { id: 'attacking' },
              value: 3,
              periods: [{ period: 1, value: 3 }],
              type: 'football_goal_total',
            },
          ],
        },
      ],
    }

    const rows = mapAnalysisStatsToRows(partial, MATCH_ID)

    expect(rows).toHaveLength(1)
    expect(rows.some((r) => r.statType === 'football_corner_total')).toBe(false)
  })

  // A team with no analysed match yields an empty item list; that is a valid
  // response, not a malformed one, and must not abort the sync.
  it('maps an empty item list to no rows', () => {
    expect(mapAnalysisStatsToRows({ items: [] }, MATCH_ID)).toEqual([])
  })

  it('throws on a malformed/unexpected payload shape', () => {
    expect(() => mapAnalysisStatsToRows({ unexpected: true }, MATCH_ID)).toThrow()
    expect(() => mapAnalysisStatsToRows(null, MATCH_ID)).toThrow()
    expect(() =>
      mapAnalysisStatsToRows({ items: [{ team_association: 'both', stats: [] }] }, MATCH_ID),
    ).toThrow()
  })
})
