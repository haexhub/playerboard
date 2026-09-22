// T039: auth composable — magic-link only, sign-out, session getter.

import { ref } from 'vue'

// Same-origin absolute paths only: rejects protocol-relative ("//host",
// "/\host") and external URLs so a redirect param can never leave the app.
export const safeInternalPath = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.startsWith('/') && raw[1] !== '/' && raw[1] !== '\\' ? raw : null

export const useAuth = () => {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const signOutError = ref<string | null>(null)

  // The Supabase magic link MUST always land on /callback so our page can
  // establish the session. The post-login destination travels as the
  // `redirect` query param of that callback URL (the same pattern the
  // invitation mail uses in server/api/invitations/issue.post.ts) and is
  // consumed by /callback, so it survives opening the link on a different
  // device or browser. It is never passed to gotrue as emailRedirectTo
  // itself, since gotrue only honors whitelisted absolute URLs.
  //
  // The mail is requested with an implicit-flow client (see otp-client.ts)
  // so the link also works when it is opened on a different device or
  // browser than the one that asked for it.
  const signInWithMagicLink = async (email: string, redirectTo?: string) => {
    const origin = useRequestURL().origin
    const { url, key } = useRuntimeConfig().public.supabase
    const path = safeInternalPath(redirectTo)
    const emailRedirectTo =
      path && path !== '/'
        ? `${origin}/callback?redirect=${encodeURIComponent(path)}`
        : `${origin}/callback`
    return await getOtpClient(url, key).auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    })
  }

  const signOut = async () => {
    signOutError.value = null
    const { error } = await client.auth.signOut()
    if (error) {
      signOutError.value = 'Abmelden fehlgeschlagen. Bitte versuche es erneut.'
      return
    }
    await navigateTo('/login')
  }

  return {
    user,
    signInWithMagicLink,
    signOut,
    signOutError,
  }
}
