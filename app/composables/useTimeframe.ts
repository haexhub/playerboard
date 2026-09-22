import { computed, ref, watch, type Ref } from 'vue'
import { isoDate } from '~/utils/dates'

export type TimeframePreset = 'last-4-weeks' | 'season' | 'custom'

export type TimeframeRange = {
  preset: TimeframePreset
  from: string
  to: string
}

const storageKey = (slug: string) => `ifa:timeframe:${slug}`

type Stored = {
  preset: TimeframePreset
  customFrom?: string | null
  customTo?: string | null
}

const readStored = (slug: string): Stored | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (
      parsed.preset === 'last-4-weeks' ||
      parsed.preset === 'season' ||
      parsed.preset === 'custom'
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

const writeStored = (slug: string, value: Stored) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(value))
  } catch {
    /* localStorage disabled — ignore */
  }
}

export const useTimeframe = (
  slug: Ref<string | null | undefined>,
  seasonStart: Ref<string | null>,
) => {
  const preset = ref<TimeframePreset>('last-4-weeks')
  const customFrom = ref<string | null>(null)
  const customTo = ref<string | null>(null)
  const today = ref(isoDate(new Date()))

  const applyStored = (s: string) => {
    const stored = readStored(s)
    if (!stored) return
    preset.value = stored.preset
    customFrom.value = stored.customFrom ?? null
    customTo.value = stored.customTo ?? null
  }

  watch(
    slug,
    (s) => {
      preset.value = 'last-4-weeks'
      customFrom.value = null
      customTo.value = null
      if (s) applyStored(s)
    },
    { immediate: true },
  )

  const range = computed<TimeframeRange>(() => {
    const to = today.value
    if (preset.value === 'custom' && customFrom.value && customTo.value) {
      return { preset: 'custom', from: customFrom.value, to: customTo.value }
    }
    if (preset.value === 'season' && seasonStart.value) {
      return { preset: 'season', from: seasonStart.value, to }
    }
    // last-4-weeks (default fallback when data missing)
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 28)
    return { preset: 'last-4-weeks', from: isoDate(fromDate), to }
  })

  const persist = () => {
    if (!slug.value) return
    writeStored(slug.value, {
      preset: preset.value,
      customFrom: customFrom.value,
      customTo: customTo.value,
    })
  }

  const setPreset = (p: TimeframePreset) => {
    preset.value = p
    persist()
  }

  const setCustom = (from: string, to: string) => {
    preset.value = 'custom'
    customFrom.value = from
    customTo.value = to
    persist()
  }

  return {
    preset,
    customFrom,
    customTo,
    range,
    setPreset,
    setCustom,
  }
}
