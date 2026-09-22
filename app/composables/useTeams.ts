import type { Database } from '~/types/database'

export const LAST_SLUG_KEY = 'ifa:lastSlug'

type MyTeam = {
  team_id: string
  role: string
  teams: {
    id: string
    name: string
    slug: string
  } | null
}

export const useTeams = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const createTeam = async (payload: { name: string; slug?: string }) => {
    return await $fetch<{ slug: string }>('/api/teams/create', {
      method: 'POST',
      body: payload,
    })
  }

  const updateWithSettings = async (
    team_id: string,
    payload: { name: string; slug: string; season_start: string },
  ) => {
    return await $fetch<{ slug: string }>(`/api/teams/${team_id}/settings`, {
      method: 'PUT',
      body: payload,
    })
  }

  const myTeams = async (): Promise<MyTeam[]> => {
    if (!user.value) return []
    const { data, error } = await client
      .from('memberships')
      .select('team_id, role, teams(id, name, slug)')
      .eq('user_id', user.value.sub)
    if (error) throw error
    return (data ?? []) as MyTeam[]
  }

  // Post-login landing: the last opened team if still a member, else the
  // first team, else onboarding. Throws when the membership query fails.
  const resolveLandingPath = async (): Promise<string> => {
    const slugs = (await myTeams()).flatMap((m) => (m.teams ? [m.teams.slug] : []))
    const lastSlug = import.meta.client ? localStorage.getItem(LAST_SLUG_KEY) : null
    const target = lastSlug && slugs.includes(lastSlug) ? lastSlug : slugs[0]
    return target ? `/t/${target}` : '/start'
  }

  return { createTeam, updateWithSettings, myTeams, resolveLandingPath }
}
