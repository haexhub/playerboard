import { describe, expect, it } from 'vitest'
import { usePlayerFormFields, type PlayerFormPlayer } from '~/composables/usePlayerFormFields'

const basePlayer: PlayerFormPlayer = {
  name: 'Alex',
  jersey_number: 7,
  position: null,
  photo_consent: false,
  active: true,
  email: null,
  linked_user_id: null,
}

describe('usePlayerFormFields', () => {
  it('accepts an unlinked player with no email', () => {
    const { validate, fieldErrors } = usePlayerFormFields(basePlayer)

    expect(validate()).toEqual({
      core: { name: 'Alex', jersey_number: 7, position: null, photo_consent: false, active: true },
      email: null,
    })
    expect(fieldErrors.value).toEqual({})
  })

  it('rejects an invalid email for an unlinked player', () => {
    const { email, validate, fieldErrors } = usePlayerFormFields(basePlayer)
    email.value = 'not-an-email'

    expect(validate()).toBeNull()
    expect(fieldErrors.value.email).toBeTruthy()
  })

  it('normalizes email to lowercase and trimmed', () => {
    const { email, validate } = usePlayerFormFields(basePlayer)
    email.value = '  Player@Example.com  '

    expect(validate()?.email).toBe('player@example.com')
  })

  it('requires a non-empty email for an already-linked player', () => {
    const linked: PlayerFormPlayer = {
      ...basePlayer,
      linked_user_id: 'user-1',
      email: 'owner@example.com',
    }
    const { email, validate, fieldErrors } = usePlayerFormFields(linked)
    email.value = ''

    expect(validate()).toBeNull()
    expect(fieldErrors.value.email).toMatch(/erforderlich/)
  })

  it('rejects a blank name', () => {
    const { name, validate, fieldErrors } = usePlayerFormFields(basePlayer)
    name.value = '   '

    expect(validate()).toBeNull()
    expect(fieldErrors.value.name).toBeTruthy()
  })

  describe('mapSaveError', () => {
    it('names the email for an email-constraint conflict', () => {
      const { mapSaveError } = usePlayerFormFields(basePlayer)
      const err = {
        statusCode: 409,
        statusMessage: 'Player conflicts with an existing player (players_email_per_team_uniq)',
      }

      expect(mapSaveError(err)).toContain('E-Mail')
    })

    it('names the jersey number for any other unique-constraint conflict', () => {
      const { mapSaveError } = usePlayerFormFields(basePlayer)
      const err = {
        statusCode: 409,
        statusMessage:
          'Player conflicts with an existing player (players_active_jersey_per_team_uniq)',
      }

      expect(mapSaveError(err)).toContain('Trikotnummer')
    })

    it('falls back to the error message for a non-conflict error', () => {
      const { mapSaveError } = usePlayerFormFields(basePlayer)

      expect(mapSaveError(new Error('network down'))).toBe('network down')
    })
  })
})
