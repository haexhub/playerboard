import { chromium } from 'playwright'

const LOGIN_URL = 'https://app.veo.co/accounts/login/'
const LOGIN_TIMEOUT_MS = 30_000

/** Drives a real headless Chromium through Veo's own login page and returns
 * the resulting `auth.veo.co` session cookie string, in the same
 * `name=value; ...` shape previously captured by hand from DevTools (see
 * research.md §9). The trainer's password only ever exists as this
 * function's argument and inside the browser process — never logged, never
 * persisted. Targets `input[type=email/password]` rather than visible
 * labels, since Veo's login form copy/DOM is undocumented and could
 * change; this still needs one real smoke test against production
 * credentials before being trusted end-to-end (see quickstart.md). */
export const captureSessionViaLogin = async (email: string, password: string): Promise<string> => {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: LOGIN_TIMEOUT_MS })

    // Best-effort cookie-consent dismissal — must not block the login
    // itself if no banner is present or the label doesn't match.
    await page
      .getByRole('button', { name: /akzeptieren|accept|zustimmen/i })
      .click({ timeout: 3_000 })
      .catch(() => undefined)

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    await emailInput.waitFor({ state: 'visible', timeout: LOGIN_TIMEOUT_MS })
    await emailInput.fill(email)
    await passwordInput.fill(password)

    await Promise.all([
      page
        .waitForURL((url) => url.hostname === 'app.veo.co', { timeout: LOGIN_TIMEOUT_MS })
        .catch(() => undefined),
      passwordInput.press('Enter'),
    ])

    if (new URL(page.url()).hostname !== 'app.veo.co') {
      throw new Error('Veo login failed (still on the Veo login page — check credentials)')
    }

    const cookies = await context.cookies('https://auth.veo.co')
    if (cookies.length === 0) {
      throw new Error('Veo login appeared to succeed but set no auth.veo.co session cookie')
    }
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  } finally {
    await browser.close()
  }
}
