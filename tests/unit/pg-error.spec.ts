import { describe, expect, it } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { pgError } from '~/server/utils/pg-error'

const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
  constraint_name: 'invitations_team_email_open_uniq',
})

describe('pgError', () => {
  it('returns the driver error from a DrizzleQueryError so the SQLSTATE stays readable', () => {
    const wrapped = new DrizzleQueryError(
      'insert into "invitations" ...',
      ['token-secret'],
      uniqueViolation,
    )

    // Guards the reason the helper exists: the wrapper itself hides the code
    // and puts SQL + params (incl. the invitation token) into its message.
    expect((wrapped as { code?: string }).code).toBeUndefined()
    expect(wrapped.message).toContain('token-secret')

    const e = pgError(wrapped)
    expect(e.code).toBe('23505')
    expect(e.constraint_name).toBe('invitations_team_email_open_uniq')
    expect(e.message).not.toContain('token-secret')
  })

  it('returns an unwrapped driver error as is', () => {
    expect(pgError(uniqueViolation).code).toBe('23505')
  })

  it('does not throw and yields no code for non-error values', () => {
    expect(pgError(undefined).code).toBeUndefined()
    expect(pgError(null).code).toBeUndefined()
    expect(pgError('boom').code).toBeUndefined()
  })
})
