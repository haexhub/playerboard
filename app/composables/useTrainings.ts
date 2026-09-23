import type { Database } from '~/types/database'

export type TrainingStatus = 'draft' | 'saved'

export type TrainingRow = {
  id: string
  team_id: string
  date: string
  title: string | null
  note: string | null
  status: TrainingStatus
  created_at: string
  created_by: string | null
  last_updated_at: string
  last_updated_by: string | null
}

export type PointEntryRow = {
  id: string
  training_id: string
  player_id: string
  category_id: string
  value: number
  last_updated_at: string
  last_updated_by: string | null
}

export type CreateDraftInput = {
  team_id: string
  date: string
  title?: string | null
  note?: string | null
}

export type UpdateEntryInput = {
  training_id: string
  player_id: string
  category_id: string
  value: number
}

export type DeleteEntryInput = {
  training_id: string
  player_id: string
  category_id: string
}

export type SaveTrainingInput = {
  date?: string
  title?: string | null
  note?: string | null
}

type TrainingDeletionJobRow = {
  id: string
  training_id: string
  team_id: string
  storage_paths: string[]
}

export const useTrainings = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const createDraft = async (input: CreateDraftInput): Promise<TrainingRow> => {
    if (!user.value) throw new Error('Not authenticated')
    const { data, error } = await client
      .from('trainings')
      .insert({
        team_id: input.team_id,
        date: input.date,
        title: input.title ?? null,
        note: input.note ?? null,
        status: 'draft',
        created_by: user.value.sub,
        last_updated_by: user.value.sub,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as TrainingRow
  }

  const updateEntry = async (input: UpdateEntryInput): Promise<PointEntryRow> => {
    if (!user.value) throw new Error('Not authenticated')
    const { data, error } = await client
      .from('point_entries')
      .upsert(
        {
          training_id: input.training_id,
          player_id: input.player_id,
          category_id: input.category_id,
          value: input.value,
          created_by: user.value.sub,
          last_updated_by: user.value.sub,
        },
        { onConflict: 'training_id,player_id,category_id' },
      )
      .select('*')
      .single()
    if (error) throw error
    return data as PointEntryRow
  }

  const deleteEntry = async (input: DeleteEntryInput): Promise<void> => {
    if (!user.value) throw new Error('Not authenticated')
    const { error } = await client
      .from('point_entries')
      .delete()
      .eq('training_id', input.training_id)
      .eq('player_id', input.player_id)
      .eq('category_id', input.category_id)
    if (error) throw error
  }

  const save = async (training_id: string, input: SaveTrainingInput = {}): Promise<TrainingRow> => {
    if (!user.value) throw new Error('Not authenticated')
    const { data, error } = await client
      .from('trainings')
      .update({
        status: 'saved',
        last_updated_by: user.value.sub,
        ...input,
      })
      .eq('id', training_id)
      .select('*')
      .single()
    if (error) throw error
    return data as TrainingRow
  }

  const deleteTraining = async (id: string): Promise<void> => {
    if (!user.value) throw new Error('Not authenticated')
    const { listStoragePaths, removeStoragePaths } = useTrainingPhotos()

    const { data: existingJob, error: jobLookupError } = await client
      .from('training_deletion_jobs')
      .select('id, training_id, team_id, storage_paths')
      .eq('training_id', id)
      .maybeSingle()
    if (jobLookupError) throw jobLookupError

    let deletionJob = existingJob as TrainingDeletionJobRow | null
    const isRecovery = deletionJob !== null

    if (!deletionJob) {
      const { data: training, error: trainingLookupError } = await client
        .from('trainings')
        .select('team_id')
        .eq('id', id)
        .maybeSingle()
      if (trainingLookupError) throw trainingLookupError
      if (!training) throw new Error('Training nicht gefunden')

      const storagePaths = await listStoragePaths(id)
      const { data: createdJob, error: jobInsertError } = await client
        .from('training_deletion_jobs')
        .insert({
          training_id: id,
          team_id: training.team_id,
          storage_paths: storagePaths,
          created_by: user.value.sub,
        })
        .select('id, training_id, team_id, storage_paths')
        .single()
      if (jobInsertError) throw jobInsertError
      deletionJob = createdJob as TrainingDeletionJobRow
    }

    const { data: deletedTraining, error: deleteError } = await client
      .from('trainings')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (deleteError) throw deleteError

    if (!deletedTraining && !isRecovery) {
      throw new Error('Training konnte nicht gelöscht werden')
    }
    if (!deletedTraining && isRecovery) {
      const { data: remainingTraining, error: remainingTrainingError } = await client
        .from('trainings')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (remainingTrainingError) throw remainingTrainingError
      if (remainingTraining) throw new Error('Training konnte nicht gelöscht werden')
    }

    await removeStoragePaths(deletionJob.storage_paths)

    const { error: jobDeleteError } = await client
      .from('training_deletion_jobs')
      .delete()
      .eq('id', deletionJob.id)
    if (jobDeleteError) throw jobDeleteError
  }

  const list = async (team_id: string): Promise<TrainingRow[]> => {
    const { data, error } = await client
      .from('trainings')
      .select('*')
      .eq('team_id', team_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as TrainingRow[]
  }

  const get = async (id: string): Promise<TrainingRow | null> => {
    const { data, error } = await client.from('trainings').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as TrainingRow) ?? null
  }

  const listEntries = async (training_id: string): Promise<PointEntryRow[]> => {
    const { data, error } = await client
      .from('point_entries')
      .select('*')
      .eq('training_id', training_id)
    if (error) throw error
    return (data ?? []) as PointEntryRow[]
  }

  return { createDraft, updateEntry, deleteEntry, deleteTraining, save, list, get, listEntries }
}
