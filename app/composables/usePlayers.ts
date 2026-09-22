import type { Database } from '~/types/database'
import { assertRowsAffected } from '~/utils/errors'

export type ActivePlayer = {
  id: string
  name: string
  jersey_number: number | null
  position: string | null
  photo_consent: boolean
}

export type Player = ActivePlayer & {
  active: boolean
  linked_user_id: string | null
}

export type LinkCandidate = { user_id: string; display_name: string | null }

export const usePlayers = () => {
  const client = useSupabaseClient<Database>()

  const listActive = async (team_id: string): Promise<ActivePlayer[]> => {
    const { data, error } = await client
      .from('players')
      .select('id, name, jersey_number, position, photo_consent')
      .eq('team_id', team_id)
      .eq('active', true)
    if (error) throw error
    const rows = (data ?? []) as ActivePlayer[]
    return rows.sort((a, b) => {
      const an = a.jersey_number
      const bn = b.jersey_number
      if (an === null && bn === null) return a.name.localeCompare(b.name, 'de')
      if (an === null) return 1
      if (bn === null) return -1
      if (an !== bn) return an - bn
      return a.name.localeCompare(b.name, 'de')
    })
  }

  const list = async (team_id: string): Promise<Player[]> => {
    const { data, error } = await client
      .from('players')
      .select('id, name, active, jersey_number, position, photo_consent, linked_user_id')
      .eq('team_id', team_id)
    if (error) throw error
    const rows = (data ?? []) as Player[]
    return rows.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      const an = a.jersey_number
      const bn = b.jersey_number
      if (an === null && bn === null) return a.name.localeCompare(b.name, 'de')
      if (an === null) return 1
      if (bn === null) return -1
      if (an !== bn) return an - bn
      return a.name.localeCompare(b.name, 'de')
    })
  }

  const create = async (
    team_id: string,
    payload: {
      name: string
      jersey_number: number | null
      position: string | null
      photo_consent: boolean
      active: boolean
    },
  ) => {
    const { data, error } = await client
      .from('players')
      .insert({ team_id, ...payload })
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  const update = async (
    id: string,
    payload: Partial<{
      name: string
      jersey_number: number | null
      position: string | null
      photo_consent: boolean
      active: boolean
    }>,
  ) => {
    const { data, error } = await client.from('players').update(payload).eq('id', id).select('id')
    if (error) throw error
    assertRowsAffected(data)
  }

  const remove = async (id: string) => {
    const { data, error } = await client.from('players').delete().eq('id', id).select('id')
    if (error) throw error
    assertRowsAffected(data)
  }

  const setActive = async (id: string, value: boolean) => {
    await update(id, { active: value })
  }

  const setConsent = async (id: string, value: boolean) => {
    await update(id, { photo_consent: value })
  }

  const listLinkCandidates = async (team_id: string): Promise<LinkCandidate[]> => {
    const { data: memberships, error: memErr } = await client
      .from('memberships')
      .select('user_id')
      .eq('team_id', team_id)
      .eq('role', 'player')
    if (memErr) throw memErr
    if (!memberships?.length) return []

    const { data: linkedRows, error: linkedErr } = await client
      .from('players')
      .select('linked_user_id')
      .eq('team_id', team_id)
      .not('linked_user_id', 'is', null)
    if (linkedErr) throw linkedErr
    const linkedIds = new Set((linkedRows ?? []).map((r) => r.linked_user_id as string))

    const unlinkedIds = memberships.map((m) => m.user_id).filter((id) => !linkedIds.has(id))
    if (unlinkedIds.length === 0) return []

    const { data: profiles, error: profErr } = await client
      .from('user_profiles')
      .select('id, display_name')
      .in('id', unlinkedIds)
    if (profErr) throw profErr
    return (profiles ?? []).map((p) => ({ user_id: p.id, display_name: p.display_name }))
  }

  const linkUser = async (id: string, user_id: string) => {
    const { data: player, error: playerErr } = await client
      .from('players')
      .select('team_id')
      .eq('id', id)
      .single()
    if (playerErr) throw playerErr

    const { data: membership, error: memErr } = await client
      .from('memberships')
      .select('role')
      .eq('team_id', player.team_id)
      .eq('user_id', user_id)
      .maybeSingle()
    if (memErr) throw memErr
    if (!membership || membership.role !== 'player') {
      throw new Error('Nutzer hat keine Spieler-Mitgliedschaft in diesem Team.')
    }

    const { data, error } = await client
      .from('players')
      .update({ linked_user_id: user_id })
      .eq('id', id)
      .select('id')
    if (error) throw error
    assertRowsAffected(data)
  }

  return { listActive, list, create, update, remove, setActive, setConsent, linkUser, listLinkCandidates }
}
