import type { Database } from '~/types/database'
import { extensionForMime, photoFileSchema } from '~/utils/validators'

const BUCKET = 'training-photos'
const SIGNED_URL_TTL_SECONDS = 600

export type TrainingPhotoRow = {
  id: string
  training_id: string
  storage_path: string
  content_type: string
  size_bytes: number
  uploaded_by: string | null
  uploaded_at: string
}

export type TrainingPhotoView = TrainingPhotoRow & { signed_url: string }

export type ConsentStatus = 'clean' | 'blocked'

export const useTrainingPhotos = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const upload = async (
    training_id: string,
    team_id: string,
    file: File,
  ): Promise<TrainingPhotoRow> => {
    if (!user.value) throw new Error('Not authenticated')
    const parsed = photoFileSchema.safeParse({
      type: file.type,
      size: file.size,
      name: file.name,
    })
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
    }

    const ext = extensionForMime(file.type)
    const path = `${team_id}/${training_id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { data, error } = await client
      .from('training_photos')
      .insert({
        training_id,
        storage_path: path,
        content_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.value.sub,
      })
      .select('*')
      .single()
    if (error) {
      const { error: cleanupError } = await client.storage.from(BUCKET).remove([path])
      const cleanupSuffix = cleanupError
        ? ` (Aufräumen fehlgeschlagen: ${cleanupError.message})`
        : ''
      throw new Error(`${error.message}${cleanupSuffix}`, { cause: error })
    }
    return data as TrainingPhotoRow
  }

  const list = async (training_id: string): Promise<TrainingPhotoView[]> => {
    const { data, error } = await client
      .from('training_photos')
      .select('*')
      .eq('training_id', training_id)
      .order('uploaded_at', { ascending: true })
    if (error) throw error
    const rows = (data ?? []) as TrainingPhotoRow[]
    if (rows.length === 0) return []
    const paths = rows.map((r) => r.storage_path)
    const { data: signed, error: signedError } = await client.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    if (signedError) throw signedError
    const byPath = new Map<string, string>()
    for (let i = 0; i < paths.length; i += 1) {
      const s = signed?.[i]
      if (s?.signedUrl) byPath.set(paths[i]!, s.signedUrl)
    }
    return rows.map((r) => ({ ...r, signed_url: byPath.get(r.storage_path) ?? '' }))
  }

  const deriveConsentStatus = async (team_id: string): Promise<ConsentStatus> => {
    const { listActive } = usePlayers()
    const players = await listActive(team_id)
    if (players.length === 0) return 'blocked'
    return players.every((p) => p.photo_consent) ? 'clean' : 'blocked'
  }

  const removeForTraining = async (training_id: string): Promise<void> => {
    const { data, error } = await client
      .from('training_photos')
      .select('storage_path')
      .eq('training_id', training_id)
    if (error) throw error
    const paths = (data ?? []).map((r) => r.storage_path)
    if (paths.length === 0) return
    const { error: removeError } = await client.storage.from(BUCKET).remove(paths)
    if (removeError) throw removeError
  }

  return { upload, list, deriveConsentStatus, removeForTraining }
}
