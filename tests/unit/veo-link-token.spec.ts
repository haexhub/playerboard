import { describe, expect, it } from 'vitest'
import { createLinkToken, verifyLinkToken } from '~/server/utils/veo/linkToken'

const SECRET = 'test-secret'

describe('createLinkToken / verifyLinkToken', () => {
  it('round-trips a valid, unexpired token', () => {
    const payload = { teamId: 'team-1', sessionCookie: 'cookie-value', exp: Date.now() + 60_000 }
    const token = createLinkToken(payload, SECRET)
    expect(verifyLinkToken(token, SECRET)).toEqual(payload)
    expect(token).not.toContain(payload.sessionCookie)
    const encodedPayload = token.split('.')[0]
    expect(encodedPayload).toBeDefined()
    expect(() => JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString('utf8'))).toThrow()
  })

  it('rejects a token signed with a different secret', () => {
    const payload = { teamId: 'team-1', sessionCookie: 'cookie-value', exp: Date.now() + 60_000 }
    const token = createLinkToken(payload, SECRET)
    expect(() => verifyLinkToken(token, 'wrong-secret')).toThrow()
  })

  it('rejects a tampered payload even if the signature format still parses', () => {
    const payload = { teamId: 'team-1', sessionCookie: 'cookie-value', exp: Date.now() + 60_000 }
    const token = createLinkToken(payload, SECRET)
    const [, signature] = token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, teamId: 'team-2' }),
      'utf8',
    ).toString('base64url')
    expect(() => verifyLinkToken(`${tamperedPayload}.${signature}`, SECRET)).toThrow()
  })

  it('rejects an expired token', () => {
    const payload = { teamId: 'team-1', sessionCookie: 'cookie-value', exp: Date.now() - 1 }
    const token = createLinkToken(payload, SECRET)
    expect(() => verifyLinkToken(token, SECRET)).toThrow()
  })

  it('rejects a malformed token', () => {
    expect(() => verifyLinkToken('not-a-token', SECRET)).toThrow()
  })
})
