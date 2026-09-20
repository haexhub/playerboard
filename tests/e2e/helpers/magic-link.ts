import { expect, type Page } from '@playwright/test'

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

type MailpitMessage = {
  ID: string
  Created: string
  To: { Address: string }[]
  Subject: string
}

const listMessagesTo = async (email: string): Promise<MailpitMessage[]> => {
  const target = email.toLowerCase()
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`)
  if (!res.ok) return []
  const list = (await res.json()) as { messages: MailpitMessage[] }
  return list.messages
    .filter((m) => m.To.some((t) => t.Address.toLowerCase() === target))
    .sort((a, b) => (a.Created < b.Created ? 1 : -1))
}

// Number of mails currently in the mailbox for `email`. Mails read by
// fetchLatestMagicLink are deleted, so this counts only unread ones.
export const countMailsTo = async (email: string): Promise<number> =>
  (await listMessagesTo(email)).length

// Waits for the newest mail to `email` that contains a magic/invite link,
// deletes that mail (so the next call sees only newer ones) and returns the link.
export const fetchLatestMagicLink = async (email: string): Promise<string> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const m of await listMessagesTo(email)) {
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)
      if (!msgRes.ok) continue
      const msg = (await msgRes.json()) as { HTML?: string; Text?: string }
      const body = msg.HTML ?? msg.Text ?? ''
      const urls = body.match(/https?:\/\/[^\s"<>]+/g) ?? []
      const link = urls.find((u) => /token=|verify|invite\//i.test(u))
      if (link) {
        await fetch(`${MAILPIT_URL}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: [m.ID] }),
        })
        return link.replace(/&amp;/g, '&')
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No magic link received for ${email}`)
}

export const signInWithMagicLink = async (page: Page, email: string) => {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: /link senden/i })).toBeEnabled()
  await page.getByLabel(/e-mail/i).fill(email)
  await page.getByRole('button', { name: /link senden/i }).click()
  await expect(page.getByText(/prüfe deine e-mails/i)).toBeVisible({ timeout: 15_000 })
  const link = await fetchLatestMagicLink(email)
  await page.goto(link, { waitUntil: 'networkidle' })
}
