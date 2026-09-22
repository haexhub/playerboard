import type { Database } from '~/types/database'

export const useTeamSettings = () => {
  const client = useSupabaseClient<Database>()

  const get = async (team_id: string) => {
    const { data, error } = await client
      .from('team_settings')
      .select('team_id, season_start')
      .eq('team_id', team_id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  return { get }
}
