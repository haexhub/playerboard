import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export type VeoLinkTokenPayload = {
  teamId: string
  sessionCookie: string
  exp: number
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url')

const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

const encryptionKey = (secret: string) => createHash('sha256').update(secret).digest()

const encryptPayload = (payload: string, secret: string): string => {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url')
}

const decryptPayload = (encodedPayload: string, secret: string): string => {
  const encrypted = Buffer.from(encodedPayload, 'base64url')
  if (encrypted.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Malformed link token payload')
  }

  const iv = encrypted.subarray(0, IV_LENGTH)
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey(secret), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Encrypts and signs the freshly captured Veo session cookie into a short-lived token
 * so it can travel from `POST /api/veo/login`'s response to
 * `POST /api/veo/link`'s request body without the browser ever receiving a
 * decodable cookie value (see quickstart.md,
 * NUXT_VEO_LINK_TOKEN_SECRET). */
export const createLinkToken = (payload: VeoLinkTokenPayload, secret: string): string => {
  const encryptedPayload = encryptPayload(JSON.stringify(payload), secret)
  return `${encryptedPayload}.${sign(encryptedPayload, secret)}`
}

export const verifyLinkToken = (token: string, secret: string): VeoLinkTokenPayload => {
  const [encryptedPayload, signature, ...extraParts] = token.split('.')
  if (!encryptedPayload || !signature || extraParts.length > 0) {
    throw new Error('Malformed link token')
  }
  const expected = sign(encryptedPayload, secret)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    throw new Error('Invalid link token signature')
  }
  const payload = JSON.parse(decryptPayload(encryptedPayload, secret)) as VeoLinkTokenPayload
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    throw new Error('Link token expired')
  }
  return payload
}
