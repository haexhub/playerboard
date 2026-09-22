import { createHmac, timingSafeEqual } from 'node:crypto'

export type VeoLinkTokenPayload = {
  teamId: string
  sessionCookie: string
  exp: number
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url')

/** Signs the freshly captured Veo session cookie into a short-lived token
 * so it can travel from `POST /api/veo/login`'s response to
 * `POST /api/veo/link`'s request body without the browser ever seeing the
 * raw cookie value in a readable form (see quickstart.md,
 * NUXT_VEO_LINK_TOKEN_SECRET). */
export const createLinkToken = (payload: VeoLinkTokenPayload, secret: string): string => {
  const json = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${json}.${sign(json, secret)}`
}

export const verifyLinkToken = (token: string, secret: string): VeoLinkTokenPayload => {
  const [json, signature] = token.split('.')
  if (!json || !signature) {
    throw new Error('Malformed link token')
  }
  const expected = sign(json, secret)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    throw new Error('Invalid link token signature')
  }
  const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as VeoLinkTokenPayload
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    throw new Error('Link token expired')
  }
  return payload
}
