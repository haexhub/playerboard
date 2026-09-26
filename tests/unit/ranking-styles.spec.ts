import { describe, expect, it } from 'vitest'
import { useRankingStyles } from '~/composables/useRankingStyles'

describe('useRankingStyles', () => {
  it('returns the shared row and badge styles for the top three ranks', () => {
    const { rowHighlightClass, rankBadgeClass } = useRankingStyles()

    expect(rowHighlightClass(1)).toContain('bg-ranking-gold/70')
    expect(rowHighlightClass(2)).toContain('bg-ranking-silver/60')
    expect(rowHighlightClass(3)).toContain('bg-ranking-bronze/50')
    expect(rankBadgeClass(1)).toContain('bg-ranking-gold-badge')
    expect(rankBadgeClass(2)).toContain('bg-ranking-silver-badge')
    expect(rankBadgeClass(3)).toContain('bg-ranking-bronze-badge')
  })

  it('keeps non-medal row highlighting available to the internal ranking', () => {
    const { rowHighlightClass } = useRankingStyles()

    expect(rowHighlightClass(4, [4])).toBe('bg-red-500/10 hover:bg-red-500/15')
    expect(rowHighlightClass(10)).toBe('bg-muted/50 hover:bg-muted/70')
    expect(rowHighlightClass(11)).toBe('')
  })

  it('returns the shared medal style and handles missing ranks', () => {
    const { medalClass } = useRankingStyles()

    expect(medalClass(1)).toContain('bg-ranking-gold/70')
    expect(medalClass(3)).toContain('bg-ranking-bronze/50')
    expect(medalClass(null)).toBe('')
  })
})
