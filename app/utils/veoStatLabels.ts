const STAT_LABELS: Record<string, string> = {
  football_goal_total: 'Tore',
  football_shots_total: 'Schüsse',
  football_attempts_total: 'Abschlüsse',
  football_corner_total: 'Ecken',
  football_free_kick_total: 'Freistöße',
  football_goal_kick_total: 'Abstöße',
  football_throw_in_total: 'Einwürfe',
  football_foul_total: 'Fouls',
  football_penalty_total: 'Elfmeter',
  football_tackle_total: 'Tacklings',
  football_dribble_total: 'Dribblings',
  football_interception_total: 'Interceptions',
  football_loose_total: 'Zweikämpfe',
  football_save_total: 'Paraden',
  // Per-player curated stats (004-veo-player-analytics research.md §3)
  distance_total_meters: 'Distanz',
  sprints_total: 'Sprints',
  top_speed_kmh: 'Höchstgeschw.',
  average_speed_kmh: 'Ø-Geschw.',
  high_intensity_runs_total: 'Intensivläufe',
  seconds_played_total: 'Spielzeit',
  football_goal_involvement_total: 'Torbeteiligungen',
}

const CATEGORY_LABELS: Record<string, string> = {
  attacking: 'Angriff',
  set_pieces: 'Standardsituationen',
  discipline: 'Disziplin',
  defending: 'Verteidigung',
  goalkeeping: 'Torwartspiel',
}

const humanize = (key: string) =>
  key
    .replace(/^football_/, '')
    .replace(/_total$/, '')
    .replace(/_/g, ' ')

export const statLabel = (statType: string) => STAT_LABELS[statType] ?? humanize(statType)
export const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category

// Fixed display order for the nine curated per-player stats (research.md §3),
// shared by every player-stats display (season summary, per-match breakdown).
export const CURATED_STAT_ORDER = [
  'distance_total_meters',
  'sprints_total',
  'top_speed_kmh',
  'average_speed_kmh',
  'high_intensity_runs_total',
  'seconds_played_total',
  'football_shots_total',
  'football_goal_total',
  'football_goal_involvement_total',
]

// Per-player curated stats (004-veo-player-analytics) are stored in Veo's own
// raw units — seconds, meters, km/h — and displayed without a unit otherwise,
// which reads as a bare, ambiguous number. seconds_played_total in particular
// is converted (seconds -> whole minutes), not just suffixed.
const STAT_UNIT_SUFFIX: Record<string, string> = {
  distance_total_meters: 'm',
  top_speed_kmh: 'km/h',
  average_speed_kmh: 'km/h',
  seconds_played_total: 'min',
}

export const formatStatValue = (statType: string, value: number): string => {
  const displayValue = statType === 'seconds_played_total' ? Math.round(value / 60) : value
  const formatted = displayValue.toLocaleString('de-DE', { maximumFractionDigits: 1 })
  const unit = STAT_UNIT_SUFFIX[statType]
  return unit ? `${formatted} ${unit}` : formatted
}
