<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Database } from '~/types/database'
import { assertRowsAffected, errorMessage } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  isTrainer: boolean
}>()

type Row = {
  user_id: string
  role: 'trainer' | 'player'
  display_name: string | null
  avatar_path: string | null
}

const client = useSupabaseClient<Database>()
const currentUser = useSupabaseUser()
const { moderateProfile } = useProfile()

const rows = ref<Row[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await client
      .from('memberships')
      .select('user_id, role')
      .eq('team_id', props.teamId)
      .order('role', { ascending: true })
    if (err) throw err

    const userIds = (data ?? []).map((r) => r.user_id)
    let profiles: { id: string; display_name: string | null; avatar_path: string | null }[] = []
    if (userIds.length > 0) {
      const { data: profileRows, error: profErr } = await client
        .from('user_profiles')
        .select('id, display_name, avatar_path')
        .in('id', userIds)
      if (profErr) throw profErr
      profiles = profileRows ?? []
    }
    const profileById = new Map(profiles.map((p) => [p.id, p]))

    rows.value = (data ?? []).map((r) => ({
      user_id: r.user_id,
      role: r.role as 'trainer' | 'player',
      display_name: profileById.get(r.user_id)?.display_name ?? null,
      avatar_path: profileById.get(r.user_id)?.avatar_path ?? null,
    }))
  } catch (err) {
    error.value = errorMessage(err, 'Mitglieder konnten nicht geladen werden.')
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, load, { immediate: true })

const trainerCount = computed(() => rows.value.filter((r) => r.role === 'trainer').length)

// A team must keep at least one trainer, so the sole trainer cannot be demoted.
const isLastTrainer = (row: Row) => row.role === 'trainer' && trainerCount.value === 1

const changeRole = async (row: Row, next: 'trainer' | 'player') => {
  error.value = null
  try {
    const { data, error: err } = await client
      .from('memberships')
      .update({ role: next })
      .eq('team_id', props.teamId)
      .eq('user_id', row.user_id)
      .select('user_id')
    if (err) throw err
    assertRowsAffected(data)
    row.role = next
  } catch (err) {
    const message = errorMessage(err, 'Mitglied konnte nicht aktualisiert werden.')
    error.value = /at least one trainer/i.test(message)
      ? 'Ein Team braucht mindestens einen Trainer.'
      : message
  }
}

const remove = async (row: Row) => {
  error.value = null
  try {
    const { data, error: err } = await client
      .from('memberships')
      .delete()
      .eq('team_id', props.teamId)
      .eq('user_id', row.user_id)
      .select('user_id')
    if (err) throw err
    assertRowsAffected(data)
    rows.value = rows.value.filter((r) => r.user_id !== row.user_id)
  } catch (err) {
    const message = errorMessage(err, 'Mitglied konnte nicht entfernt werden.')
    error.value = /at least one trainer/i.test(message)
      ? 'Ein Team braucht mindestens einen Trainer.'
      : message
  }
}

const resetAvatar = async (row: Row) => {
  error.value = null
  try {
    await moderateProfile({ target_user_id: row.user_id, team_id: props.teamId, field: 'avatar' })
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Avatar konnte nicht zurückgesetzt werden.')
  }
}

const resetName = async (row: Row) => {
  error.value = null
  try {
    await moderateProfile({ target_user_id: row.user_id, team_id: props.teamId, field: 'name' })
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Name konnte nicht zurückgesetzt werden.')
  }
}

defineExpose({ reload: load })
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-foreground">Mitglieder</h3>
    <p v-if="loading" class="text-sm text-muted-foreground">Lade…</p>
    <p v-else-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
    <ul v-else class="space-y-2">
      <li v-for="row in rows" :key="row.user_id">
        <ShadcnCard class="py-3">
          <ShadcnCardContent
            class="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between px-3"
          >
            <div class="flex items-center gap-3 text-sm">
              <img
                v-if="row.avatar_path"
                :src="`/api/profile/avatar/${row.user_id}`"
                alt=""
                data-testid="member-avatar-image"
                class="h-8 w-8 rounded-full object-cover bg-muted"
              />
              <div
                v-else
                class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs"
                aria-hidden="true"
              >
                ?
              </div>
              <div>
                <p class="font-medium text-foreground">
                  {{ row.display_name ?? row.user_id }}
                  <span
                    v-if="row.user_id === currentUser?.sub"
                    class="text-xs text-muted-foreground"
                    >(du)</span
                  >
                </p>
                <p class="text-muted-foreground">
                  {{ row.role === 'trainer' ? 'Trainer' : 'Spieler' }}
                </p>
              </div>
            </div>
            <div v-if="isTrainer" class="flex flex-wrap gap-2">
              <select
                :value="row.role"
                class="min-h-touch px-2 rounded-md border border-input bg-background text-sm"
                @change="
                  (e) =>
                    changeRole(row, (e.target as HTMLSelectElement).value as 'trainer' | 'player')
                "
              >
                <option value="player" :disabled="isLastTrainer(row)">Spieler</option>
                <option value="trainer">Trainer</option>
              </select>
              <ShadcnButton
                type="button"
                data-testid="member-reset-avatar"
                variant="outline"
                size="sm"
                @click="resetAvatar(row)"
              >
                Avatar zurücksetzen
              </ShadcnButton>
              <ShadcnButton
                type="button"
                data-testid="member-reset-name"
                variant="outline"
                size="sm"
                @click="resetName(row)"
              >
                Namen zurücksetzen
              </ShadcnButton>
              <ShadcnButton type="button" variant="destructive" size="sm" @click="remove(row)">
                Entfernen
              </ShadcnButton>
            </div>
          </ShadcnCardContent>
        </ShadcnCard>
      </li>
    </ul>
  </div>
</template>
