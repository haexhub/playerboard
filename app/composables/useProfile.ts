import type { Database } from '~/types/database'
import { assertRowsAffected } from '~/utils/errors'
import { displayNameSchema, extensionForMime, photoFileSchema } from '~/utils/validators'

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

  const moderateProfile = async (payload: {
    target_user_id: string
    team_id: string
    field: 'name' | 'avatar'
  }): Promise<void> => {
    await $fetch('/api/profile/moderate', { method: 'POST', body: payload })
  }

  return { getOwnProfile, updateDisplayName, uploadAvatar, removeAvatar, moderateProfile }
}
