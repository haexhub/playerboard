type PlacementRank = 1 | 2 | 3

const ROW_HIGHLIGHT_CLASSES: Record<PlacementRank, string> = {
  1: 'bg-ranking-gold/70 hover:bg-ranking-gold/90 font-semibold',
  2: 'bg-ranking-silver/60 hover:bg-ranking-silver/80 font-semibold',
  3: 'bg-ranking-bronze/50 hover:bg-ranking-bronze/70 font-semibold',
}

const BADGE_CLASSES: Record<PlacementRank, string> = {
  1: 'bg-ranking-gold-badge text-ranking-gold-foreground border-transparent',
  2: 'bg-ranking-silver-badge text-ranking-silver-foreground border-transparent',
  3: 'bg-ranking-bronze-badge text-ranking-bronze-foreground border-transparent',
}

const MEDAL_CLASSES: Record<PlacementRank, string> = {
  1: 'rounded bg-ranking-gold/70 font-semibold text-ranking-gold-foreground',
  2: 'rounded bg-ranking-silver/60 font-semibold text-ranking-silver-foreground',
  3: 'rounded bg-ranking-bronze/50 font-semibold text-ranking-bronze-foreground',
}

export const useRankingStyles = () => {
  const rowHighlightClass = (rank: number, bottomRanks: readonly number[] = []): string => {
    if (rank in ROW_HIGHLIGHT_CLASSES) {
      return ROW_HIGHLIGHT_CLASSES[rank as PlacementRank]
    }
    if (bottomRanks.includes(rank)) return 'bg-red-500/10 hover:bg-red-500/15'
    if (rank <= 10) return 'bg-muted/50 hover:bg-muted/70'
    return ''
  }

  const rankBadgeClass = (rank: number): string =>
    rank in BADGE_CLASSES ? BADGE_CLASSES[rank as PlacementRank] : ''

  const medalClass = (rank: number | null): string =>
    rank !== null && rank in MEDAL_CLASSES ? MEDAL_CLASSES[rank as PlacementRank] : ''

  return { rowHighlightClass, rankBadgeClass, medalClass }
}
