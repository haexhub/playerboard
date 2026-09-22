import { z } from 'zod'
import { isoDate } from '~/utils/dates'

export const PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024

export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number]

export const pointValueSchema = (min: number, max: number) =>
  z
    .number({ error: 'Bitte eine Zahl eingeben' })
    .int('Nur ganze Zahlen')
    .min(min, `Mindestens ${min}`)
    .max(max, `Höchstens ${max}`)

export const photoFileSchema = z
  .object({
    type: z.string(),
    size: z.number().int().nonnegative(),
    name: z.string().optional(),
  })
  .superRefine((file, ctx) => {
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nicht unterstütztes Bildformat',
        path: ['type'],
      })
    }
    if (file.size <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Datei ist leer',
        path: ['size'],
      })
    }
    if (file.size > PHOTO_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Datei größer als 10 MB',
        path: ['size'],
      })
    }
  })

export const trainingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format YYYY-MM-DD')
  .refine((value) => {
    // The regex alone accepts '2025-02-30'; only a round-trip proves the day exists.
    const d = new Date(value)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
  }, 'Ungültiges Datum')
  .refine((value) => value <= isoDate(new Date()), 'Datum darf nicht in der Zukunft liegen')

// Matches the DB check constraint (user_profiles_display_name_len_check):
// zero-width characters don't count as visible, so a name made only of them
// must still be rejected as too short.
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g

export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(ZERO_WIDTH_CHARS, '').trim())
  .refine((value) => value.length >= 2, 'Name muss mindestens 2 Zeichen haben.')

export const extensionForMime = (mime: string): string => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/heic':
      return 'heic'
    case 'image/heif':
      return 'heif'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}
