import { describe, expect, it } from 'vitest'
import {
  PHOTO_MAX_BYTES,
  displayNameSchema,
  extensionForMime,
  photoFileSchema,
  pointValueSchema,
  trainingDateSchema,
} from '~/utils/validators'

describe('pointValueSchema', () => {
  it('accepts values within [min, max]', () => {
    const schema = pointValueSchema(0, 10)
    expect(schema.safeParse(0).success).toBe(true)
    expect(schema.safeParse(5).success).toBe(true)
    expect(schema.safeParse(10).success).toBe(true)
  })

  it('rejects values outside the range', () => {
    const schema = pointValueSchema(1, 5)
    expect(schema.safeParse(0).success).toBe(false)
    expect(schema.safeParse(6).success).toBe(false)
  })

  it('rejects non-integer values', () => {
    const schema = pointValueSchema(0, 10)
    expect(schema.safeParse(3.5).success).toBe(false)
  })

  it('rejects non-numbers', () => {
    const schema = pointValueSchema(0, 10)
    expect(schema.safeParse('5' as unknown as number).success).toBe(false)
  })

  it('allows negative ranges', () => {
    const schema = pointValueSchema(-3, 3)
    expect(schema.safeParse(-3).success).toBe(true)
    expect(schema.safeParse(-4).success).toBe(false)
  })
})

describe('photoFileSchema', () => {
  const validFile = { type: 'image/jpeg', size: 1024, name: 'a.jpg' }

  it('accepts allowed mime types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']) {
      expect(photoFileSchema.safeParse({ ...validFile, type }).success).toBe(true)
    }
  })

  it('rejects other mime types', () => {
    expect(photoFileSchema.safeParse({ ...validFile, type: 'image/gif' }).success).toBe(false)
    expect(photoFileSchema.safeParse({ ...validFile, type: 'application/pdf' }).success).toBe(false)
  })

  it('rejects empty files', () => {
    expect(photoFileSchema.safeParse({ ...validFile, size: 0 }).success).toBe(false)
  })

  it('rejects files at or above 10MB + 1 byte', () => {
    expect(photoFileSchema.safeParse({ ...validFile, size: PHOTO_MAX_BYTES }).success).toBe(true)
    expect(photoFileSchema.safeParse({ ...validFile, size: PHOTO_MAX_BYTES + 1 }).success).toBe(
      false,
    )
  })
})

describe('trainingDateSchema', () => {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  it('accepts today', () => {
    expect(trainingDateSchema.safeParse(iso(new Date())).success).toBe(true)
  })

  it('accepts a past date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 30)
    expect(trainingDateSchema.safeParse(iso(past)).success).toBe(true)
  })

  it('rejects a future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 1)
    expect(trainingDateSchema.safeParse(iso(future)).success).toBe(false)
  })

  it('rejects malformed strings', () => {
    expect(trainingDateSchema.safeParse('12/04/2026').success).toBe(false)
    expect(trainingDateSchema.safeParse('2026-4-5').success).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(trainingDateSchema.safeParse('2026-01-99').success).toBe(false)
    expect(trainingDateSchema.safeParse('2025-02-30').success).toBe(false)
  })
})

describe('displayNameSchema', () => {
  it('accepts a normal 2+ character name', () => {
    const parsed = displayNameSchema.safeParse('Al')
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toBe('Al')
  })

  it('trims surrounding whitespace', () => {
    const parsed = displayNameSchema.safeParse('  Alex  ')
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toBe('Alex')
  })

  it('rejects an empty string', () => {
    expect(displayNameSchema.safeParse('').success).toBe(false)
  })

  it('rejects whitespace-only input', () => {
    expect(displayNameSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects a single character', () => {
    expect(displayNameSchema.safeParse('A').success).toBe(false)
  })

  it('rejects two zero-width spaces as if they were empty', () => {
    expect(displayNameSchema.safeParse('​​').success).toBe(false)
  })

  it('still accepts a 2-character name padded with zero-width characters', () => {
    const parsed = displayNameSchema.safeParse('​Al​')
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toBe('Al')
  })
})

describe('extensionForMime', () => {
  it('maps supported mime types', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/heic')).toBe('heic')
    expect(extensionForMime('image/heif')).toBe('heif')
    expect(extensionForMime('image/webp')).toBe('webp')
  })

  it('falls back to bin for unknown', () => {
    expect(extensionForMime('image/gif')).toBe('bin')
  })
})
