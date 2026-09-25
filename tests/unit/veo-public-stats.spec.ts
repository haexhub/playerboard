import { describe, expect, it } from 'vitest'
import { medalRanksForStat } from '~/utils/veoPublicStats'

describe('medalRanksForStat', () => {
  it('ranks every available value and ignores missing values', () => {
    expect(medalRanksForStat([100, 90, undefined, 80, 70], 3)).toEqual([1, 2, null, 3, null])
  })

  it('gives tied values the same medal and keeps all rows visible to the caller', () => {
    expect(medalRanksForStat([100, 90, 90, 80], 3)).toEqual([1, 2, 2, 3])
  })

  it('does not assign medals when fewer than three distinct values exist', () => {
    expect(medalRanksForStat([100, 100, undefined], 3)).toEqual([1, 1, null])
  })
})
