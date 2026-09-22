import { describe, expect, it } from 'vitest'
import { nextUniqueSlug, toSlug } from '~/utils/slug'

describe('toSlug', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(toSlug('FC Barcelona')).toBe('fc-barcelona')
  })

  it('transliterates unicode to ASCII', () => {
    expect(toSlug('Bayern München')).toBe('bayern-munchen')
    expect(toSlug('Fußball Team Ø')).toBe('fussball-team-o')
  })

  it('is stable for already-slug-shaped input', () => {
    expect(toSlug('u17-north')).toBe('u17-north')
  })

  it('collapses consecutive whitespace and dashes', () => {
    expect(toSlug('  hello   world  ')).toBe('hello-world')
    expect(toSlug('a--b--c')).toBe('a-b-c')
  })

  it('preserves numeric characters', () => {
    expect(toSlug('U 20 A')).toBe('u-20-a')
  })
})

describe('nextUniqueSlug', () => {
  it('returns the base slug when free', async () => {
    const result = await nextUniqueSlug('team', () => false)
    expect(result).toBe('team')
  })

  it('appends -2 for the first collision', async () => {
    const taken = new Set(['team'])
    const result = await nextUniqueSlug('team', (c) => taken.has(c))
    expect(result).toBe('team-2')
  })

  it('walks -2, -3 until a free slot is found', async () => {
    const taken = new Set(['team', 'team-2', 'team-3'])
    const result = await nextUniqueSlug('team', (c) => taken.has(c))
    expect(result).toBe('team-4')
  })

  it('normalizes the base before checking', async () => {
    const result = await nextUniqueSlug('FC Bayern', () => false)
    expect(result).toBe('fc-bayern')
  })

  it('supports async existence checks', async () => {
    const taken = new Set(['team'])
    const result = await nextUniqueSlug('team', async (c) => taken.has(c))
    expect(result).toBe('team-2')
  })

  it('throws on empty base', async () => {
    await expect(nextUniqueSlug('   ', () => false)).rejects.toThrow()
  })

  // Without the bail-out the caller (POST /api/teams/create) would spin forever.
  it('gives up instead of looping when every candidate is taken', async () => {
    await expect(nextUniqueSlug('team', () => true)).rejects.toThrow(/exhausted/)
  })
})
