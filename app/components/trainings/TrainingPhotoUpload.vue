<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useTrainingPhotos, type TrainingPhotoView } from '~/composables/useTrainingPhotos'
import { PHOTO_MIME_TYPES } from '~/utils/validators'

const props = defineProps<{ trainingId: string; teamId: string; photos: TrainingPhotoView[] }>()
const emit = defineEmits<{ uploaded: [] }>()

const { upload } = useTrainingPhotos()

const inputRef = ref<HTMLInputElement | null>(null)

type FileState = {
  name: string
  size: number
  progress: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}
const queued = reactive<FileState[]>([])
const isBusy = ref(false)

const handlePick = async (evt: Event) => {
  const input = evt.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const files = Array.from(input.files)
  input.value = ''
  isBusy.value = true
  let anyOk = false
  for (const file of files) {
    const state: FileState = {
      name: file.name,
      size: file.size,
      progress: 'uploading',
    }
    queued.push(state)
    try {
      await upload(props.trainingId, props.teamId, file)
      state.progress = 'done'
      anyOk = true
    } catch (err) {
      state.progress = 'error'
      state.error = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
    }
  }
  isBusy.value = false
  if (anyOk) emit('uploaded')
}

const openPicker = () => inputRef.value?.click()

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <section class="space-y-3" data-testid="training-photo-upload">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-neutral-900">Fotos</h2>
        <p class="text-sm text-neutral-600">
          JPEG, PNG, HEIC/HEIF oder WebP · bis 10 MB.
        </p>
      </div>
      <button
        type="button"
        class="min-h-touch px-3 rounded border border-neutral-300 text-sm hover:bg-neutral-100 disabled:opacity-50"
        :disabled="isBusy"
        data-testid="photo-upload-button"
        @click="openPicker"
      >
        Fotos auswählen
      </button>
      <input
        ref="inputRef"
        type="file"
        multiple
        :accept="PHOTO_MIME_TYPES.join(',')"
        class="hidden"
        data-testid="photo-upload-input"
        @change="handlePick"
      />
    </div>

    <ul v-if="queued.length" class="space-y-1 text-sm">
      <li
        v-for="(f, i) in queued"
        :key="`${f.name}-${i}`"
        class="flex justify-between gap-3 rounded border border-neutral-200 bg-white px-3 py-2"
      >
        <span class="truncate">{{ f.name }} · {{ humanSize(f.size) }}</span>
        <span v-if="f.progress === 'uploading'" class="text-neutral-500">läuft…</span>
        <span v-else-if="f.progress === 'done'" class="text-green-700">OK</span>
        <span v-else-if="f.progress === 'error'" class="text-red-700">{{ f.error }}</span>
      </li>
    </ul>

    <div v-if="photos.length" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <template v-for="p in photos" :key="p.id">
        <a
          v-if="p.signed_url"
          :href="p.signed_url"
          target="_blank"
          rel="noopener"
          class="block aspect-square overflow-hidden rounded border border-neutral-200 bg-neutral-100"
        >
          <img
            :src="p.signed_url"
            :alt="`Foto ${p.id}`"
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
      </template>
    </div>

    <p v-if="photos.length === 0" class="text-sm text-neutral-500" data-testid="photo-empty-hint">
      Noch keine Fotos hochgeladen.
    </p>
  </section>
</template>
