/**
 * Returns dense ranks for one public Veo statistic.
 *
 * Missing values are not ranked. Equal values receive the same rank, so a
 * tie for third place still gets the bronze highlight for every tied row.
 */
export const medalRanksForStat = (
  values: Array<number | undefined>,
  medalCount: number,
): Array<number | null> => {
  const rankedValues = values
    .map((value, index) => ({ index, value }))
    .filter((entry): entry is { index: number; value: number } => entry.value !== undefined)
    .sort((a, b) => b.value - a.value)

  const ranks = values.map(() => null as number | null)
  let rank = 0
  let previousValue: number | undefined

  for (const entry of rankedValues) {
    if (entry.value !== previousValue) {
      rank += 1
      previousValue = entry.value
    }
    if (rank > medalCount) break
    ranks[entry.index] = rank
  }

  return ranks
}
