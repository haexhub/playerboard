import type { Database } from '~/types/database'
import { assertRowsAffected } from '~/utils/errors'
import { displayNameSchema, extensionForMime, photoFileSchema } from '~/utils/validators'

export type SoleTrainerTeam = {
  team_id: string
  team_name: string
  candidates: { user_id: string; display_name: string }[]
}

export type OwnProfile = {
  display_name: string | null
  avatar_path: string | null
  avatar_url: string | null
}

export const useProfile = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const updateDisplayName = async (name: string): Promise<void> => {
    const uid = user.value?.sub
    if (!uid) throw new Error('Nicht angemeldet')
    const parsed = displayNameSchema.safeParse(name)
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Name muss mindestens 2 Zeichen haben.')
    }
    const { data, error } = await client
      .from('user_profiles')
      .update({ display_name: parsed.data })
      .eq('id', uid)
      .select('id')
    if (error) {
      if (error.code === '23514') {
        throw new Error('Name muss mindestens 2 Zeichen haben.')
      }
      throw error
    }
    assertRowsAffected(data)
  }

  const uploadAvatar = async (file: File): Promise<void> => {
    const uid = user.value?.sub
    if (!uid) throw new Error('Nicht angemeldet')
    const parsed = photoFileSchema.safeParse({
      type: file.type,
      size: file.size,
      name: file.name,
    })
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Datei')
    }

    const path = `${uid}/${crypto.randomUUID()}.${extensionForMime(file.type)}`
    const { error: uploadError } = await client.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type })
    if (uploadError) throw uploadError

    const { data: before, error: readError } = await client
      .from('user_profiles')
      .select('avatar_path')
      .eq('id', uid)
      .single()
    if (readError) {
      await client.storage
        .from('avatars')
        .remove([path])
        .catch(() => undefined)
      throw readError
    }
    const previousPath = before?.avatar_path ?? null

    const { error: updateError } = await client
      .from('user_profiles')
      .update({ avatar_path: path })
      .eq('id', uid)
    if (updateError) {
      await client.storage
        .from('avatars')
        .remove([path])
        .catch(() => undefined)
      throw updateError
    }

    if (previousPath && previousPath !== path) {
      await client.storage
        .from('avatars')
        .remove([previousPath])
        .catch(() => undefined)
    }
  }

  const removeAvatar = async (): Promise<void> => {
    const uid = user.value?.sub
    if (!uid) throw new Error('Nicht angemeldet')

    const { data: before, error: readError } = await client
      .from('user_profiles')
      .select('avatar_path')
      .eq('id', uid)
      .single()
    if (readError) throw readError
    const previousPath = before?.avatar_path ?? null
    if (!previousPath) return

    const { error: updateError } = await client
      .from('user_profiles')
      .update({ avatar_path: null })
      .eq('id', uid)
    if (updateError) throw updateError

    const { error: removeError } = await client.storage.from('avatars').remove([previousPath])
    if (removeError) throw removeError
  }

  const getOwnProfile = async (): Promise<OwnProfile> => {
    const uid = user.value?.sub
    if (!uid) throw new Error('Nicht angemeldet')
    const { data, error } = await client
      .from('user_profiles')
      .select('display_name, avatar_path')
      .eq('id', uid)
      .single()
    if (error) throw error
    return {
      display_name: data.display_name,
      avatar_path: data.avatar_path,
      avatar_url: data.avatar_path ? `/api/profile/avatar/${uid}` : null,
    }
  }

  // Teams the caller trains alone. Each has to be resolved before the account
  // can go: hand the role to another member, or delete the team when nobody
  // else is in it. The server re-checks all of this.
  const soleTrainerTeams = async (): Promise<SoleTrainerTeam[]> => {
    const uid = user.value?.sub
    if (!uid) throw new Error('Nicht angemeldet')

    const { data: mine, error: mineErr } = await client
      .from('memberships')
      .select('team_id, teams(name)')
      .eq('user_id', uid)
      .eq('role', 'trainer')
    if (mineErr) throw mineErr
    if (!mine?.length) return []

    const teamIds = mine.map((m) => m.team_id)
    const { data: others, error: othersErr } = await client
      .from('memberships')
      .select('team_id, user_id, role')
      .in('team_id', teamIds)
      .neq('user_id', uid)
    if (othersErr) throw othersErr

    // memberships and user_profiles both point at auth.users, so PostgREST
    // cannot embed one in the other; the names are fetched separately.
    const otherIds = [...new Set((others ?? []).map((m) => m.user_id))]
    const nameById = new Map<string, string | null>()
    if (otherIds.length > 0) {
      const { data: profiles, error: profErr } = await client
        .from('user_profiles')
        .select('id, display_name')
        .in('id', otherIds)
      if (profErr) throw profErr
      for (const profile of profiles ?? []) nameById.set(profile.id, profile.display_name)
    }

    return mine.flatMap((team) => {
      const rest = (others ?? []).filter((m) => m.team_id === team.team_id)
      if (rest.some((m) => m.role === 'trainer')) return []
      return [
        {
          team_id: team.team_id,
          team_name: team.teams?.name ?? 'Team',
          candidates: rest.map((m) => ({
            user_id: m.user_id,
            display_name: nameById.get(m.user_id) ?? 'Unbenanntes Mitglied',
          })),
        },
      ]
    })
  }

  const deleteAccount = async (payload: {
    handovers: { team_id: string; new_trainer_user_id: string }[]
    delete_team_ids: string[]
  }): Promise<void> => {
    await $fetch('/api/profile/delete', { method: 'POST', body: payload })
  }

  const moderateProfile = async (payload: {
    target_user_id: string
    team_id: string
    field: 'name' | 'avatar'
  }): Promise<void> => {
    await $fetch('/api/profile/moderate', { method: 'POST', body: payload })
  }

  return {
    getOwnProfile,
    updateDisplayName,
    uploadAvatar,
    removeAvatar,
    moderateProfile,
    soleTrainerTeams,
    deleteAccount,
  }
}
