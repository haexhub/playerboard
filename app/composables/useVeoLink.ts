import type { Database } from '~/types/database'

export type VeoClubOption = {
  club_slug: string
  club_name: string
  teams: { team_slug: string; team_name: string }[]
}

export const useVeoLink = () => {
  const client = useSupabaseClient<Database>()

  const getCurrentMapping = async (team_id: string) => {
    const { data, error } = await client
      .from('veo_team_mappings')
      .select('veo_club_slug, veo_team_slug, enabled, public_stats_enabled')
      .eq('team_id', team_id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const setPublicStatsEnabled = async (team_id: string, enabled: boolean) => {
    const { error } = await client
      .from('veo_team_mappings')
      .update({ public_stats_enabled: enabled })
      .eq('team_id', team_id)
    if (error) throw error
  }

  const login = async (payload: { team_id: string; email: string; password: string }) => {
    return await $fetch<{ clubs: VeoClubOption[]; link_token: string }>('/api/veo/login', {
      method: 'POST',
      body: payload,
    })
  }

  const link = async (payload: {
    team_id: string
    veo_club_slug: string
    veo_team_slug: string
    link_token: string
  }) => {
    return await $fetch<{ ok: true }>('/api/veo/link', { method: 'POST', body: payload })
  }

  return { getCurrentMapping, login, link, setPublicStatsEnabled }
}
