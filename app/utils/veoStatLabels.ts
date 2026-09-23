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
