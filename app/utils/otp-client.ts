import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Client used ONLY to request the login mail.
//
// The shared browser client (@supabase/ssr) is hard-wired to PKCE: its code
// verifier lives in the browser that asked for the link, so a link opened on
// another device (mail on the phone, login on the desktop) can never be
// exchanged. The implicit flow puts the tokens in the URL fragment instead,
// which /callback already consumes (consumeImplicitFragment) — the same path
// the invitation mails take. Nothing is persisted here; /callback establishes
// the session on the normal client.
//
// One shared instance: it holds no per-user state, and creating a new one per
// call would make supabase-js warn about multiple GoTrueClient instances.
let otpClient: SupabaseClient | undefined

export const getOtpClient = (url: string, key: string): SupabaseClient => {
  otpClient ??= createClient(url, key, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Own storage key so this client is not counted as a second instance
      // of the app's session client.
      storageKey: 'ifa:otp-request',
    },
  })
  return otpClient
}
