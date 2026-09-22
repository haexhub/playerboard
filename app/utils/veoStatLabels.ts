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
