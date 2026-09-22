import type { Database } from '~/types/database'
import { assertRowsAffected } from '~/utils/errors'

type Role = 'trainer' | 'player'

export const useInvitations = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const issue = async (payload: {
    team_id: string
    email: string
    role: Role
    player_id?: string
  }) => {
    return await $fetch<{ id: string }>('/api/invitations/issue', {
      method: 'POST',
      body: payload,
    })
  }

  const accept = async (token: string) => {
    return await $fetch<{ slug: string }>('/api/invitations/accept', {
      method: 'POST',
      body: { token },
    })
  }

  const listOpenByTeam = async (team_id: string) => {
    const { data, error } = await client
      .from('invitations')
      .select('id, email, role, expires_at, created_at, accepted_at')
      .eq('team_id', team_id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  const listMineByEmail = async () => {
    const email = user.value?.email
    if (!email) return []
    const { data, error } = await client
      .from('invitations')
      .select('id, token, role, expires_at, team_id, teams(name, slug)')
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  const revoke = async (id: string) => {
    const { data, error } = await client.from('invitations').delete().eq('id', id).select('id')
    if (error) throw error
    assertRowsAffected(data)
  }

  return { issue, accept, listOpenByTeam, listMineByEmail, revoke }
}
