<script setup lang="ts">
import { ref, watch } from 'vue'
import { useProfile } from '~/composables/useProfile'
import { errorMessage } from '~/utils/errors'
import { PHOTO_MIME_TYPES } from '~/utils/validators'

const props = defineProps<{
  displayName: string | null
  avatarUrl: string | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateDisplayName, uploadAvatar, removeAvatar } = useProfile()

const name = ref(props.displayName ?? '')
const nameError = ref<string | null>(null)
const nameLoading = ref(false)

const avatarInput = ref<HTMLInputElement | null>(null)
const avatarError = ref<string | null>(null)
const avatarLoading = ref(false)

watch(
  () => props.displayName,
  (value) => {
    name.value = value ?? ''
  },
)

const submitName = async () => {
  nameError.value = null
  nameLoading.value = true
  try {
    await updateDisplayName(name.value)
    emit('saved')
  } catch (err) {
    nameError.value = errorMessage(err, 'Name konnte nicht gespeichert werden.')
  } finally {
    nameLoading.value = false
  }
}

const onAvatarPick = async (evt: Event) => {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  avatarError.value = null
  avatarLoading.value = true
  try {
    await uploadAvatar(file)
    emit('saved')
  } catch (err) {
    avatarError.value = errorMessage(err, 'Avatar konnte nicht hochgeladen werden.')
  } finally {
    avatarLoading.value = false
  }
}

const onAvatarRemove = async () => {
  avatarError.value = null
  avatarLoading.value = true
  try {
    await removeAvatar()
    emit('saved')
  } catch (err) {
    avatarError.value = errorMessage(err, 'Avatar konnte nicht entfernt werden.')
  } finally {
    avatarLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        alt=""
        data-testid="profile-avatar-image"
        class="h-16 w-16 rounded-full object-cover bg-muted"
      />
      <div
        v-else
        data-testid="profile-avatar-placeholder"
        class="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xl"
        aria-hidden="true"
      >
        ?
      </div>
      <div class="space-y-1">
        <div class="flex gap-2">
          <ShadcnButton
            type="button"
            variant="outline"
            size="sm"
            :disabled="avatarLoading"
            @click="avatarInput?.click()"
          >
            {{ avatarLoading ? 'Lädt…' : 'Avatar wählen' }}
          </ShadcnButton>
          <ShadcnButton
            v-if="avatarUrl"
            type="button"
            variant="outline"
            size="sm"
            :disabled="avatarLoading"
            data-testid="profile-avatar-remove"
            @click="onAvatarRemove"
          >
            Avatar entfernen
          </ShadcnButton>
        </div>
        <input
          ref="avatarInput"
          type="file"
          :accept="PHOTO_MIME_TYPES.join(',')"
          class="hidden"
          data-testid="profile-avatar-input"
          @change="onAvatarPick"
        />
        <p
          v-if="avatarError"
          role="alert"
          class="text-sm text-destructive"
          data-testid="profile-avatar-error"
        >
          {{ avatarError }}
        </p>
      </div>
    </div>

    <form class="space-y-3" novalidate data-testid="profile-form" @submit.prevent="submitName">
      <ShadcnLabel class="block space-y-1">
        <span>Name</span>
        <ShadcnInput v-model="name" type="text" required />
        <span v-if="nameError" role="alert" class="block text-sm text-destructive">{{
          nameError
        }}</span>
      </ShadcnLabel>
      <ShadcnButton type="submit" :disabled="nameLoading" data-testid="profile-form-save-name">
        {{ nameLoading ? 'Speichere…' : 'Speichern' }}
      </ShadcnButton>
    </form>
  </div>
</template>
