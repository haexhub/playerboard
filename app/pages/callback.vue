<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AuthError } from '@supabase/supabase-js'
import { safeInternalPath } from '~/composables/useAuth'
import type { Database } from '~/types/database'

interface AuthErrorInfo {
  message: string
  status?: number
  code?: string
  name: string
}

interface CallbackDiag {
  hasHash?: boolean
  hasCode?: boolean
  hasSession?: boolean
  implicitError?: AuthErrorInfo
  pkceError?: AuthErrorInfo
}

const describeAuthError = (err: AuthError): AuthErrorInfo => ({
  message: err.message,
  status: err.status,
  code: err.code,
  name: err.name,
})

// GoTrue reports a link it could not verify (expired, already used) as
// error/error_code/error_description params on the redirect instead of
// tokens: in the fragment for implicit links, in the query for PKCE ones.
const describeRedirectError = (params: URLSearchParams): AuthErrorInfo | null => {
  const error = params.get('error')
  const code = params.get('error_code')
  const description = params.get('error_description')
  if (!error && !code && !description) return null
  return {
    message: description ?? error ?? 'unspecified redirect error',
    code: code ?? undefined,
    name: 'AuthRedirectError',
  }
}

const reportAuthError = (diag: CallbackDiag) => {
  $fetch('/api/auth/callback-error', { method: 'POST', body: diag }).catch(() => {})
}

definePageMeta({
  layout: 'onboarding',
})

const user = useSupabaseUser()
const route = useRoute()
const client = useSupabaseClient<Database>()
const error = ref<string | null>(null)
const { resolveLandingPath } = useTeams()

const finalize = async () => {
  const redirect = safeInternalPath(route.query.redirect)
  if (redirect) {
    await navigateTo(redirect, { replace: true })
    return
  }

  if (!user.value) return
  let target: string
  try {
    target = await resolveLandingPath()
  } catch {
    error.value = 'Teams konnten nicht geladen werden. Bitte lade die Seite neu.'
    return
  }
  await navigateTo(target, { replace: true })
}

const consumeImplicitFragment = async (diag: CallbackDiag): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.hash.slice(1))
  diag.hasHash = params.has('access_token')
  const redirectError = describeRedirectError(params)
  if (!diag.hasHash && !redirectError) return false
  // Drop the fragment before anything else so neither the tokens nor the
  // error params outlive this page in the URL or the browser history.
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  if (redirectError) {
    diag.implicitError = redirectError
    return false
  }
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return false
  const { error: setErr } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (setErr) {
    diag.implicitError = describeAuthError(setErr)
    return false
  }
  return true
}

const consumePkceCode = async (diag: CallbackDiag): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  diag.hasCode = Boolean(code)
  const redirectError = describeRedirectError(params)
  if (redirectError) {
    diag.pkceError = redirectError
    return false
  }
  if (!code) return false
  const { error: exchangeErr } = await client.auth.exchangeCodeForSession(code)
  if (exchangeErr) {
    diag.pkceError = describeAuthError(exchangeErr)
    return false
  }
  history.replaceState(null, '', window.location.pathname)
  return true
}

// Waits for `user.value`, not just for a session to exist. @nuxtjs/supabase
// only populates useSupabaseUser() from its onAuthStateChange listener, one
// getClaims() round trip after the session lands (see supabase.client.ts) --
// finalize() reads user.value, so returning as soon as getSession() sees a
// session (as this used to) can fire finalize() before that catches up, and
// it silently no-ops on `if (!user.value) return`.
const pollForSession = async () => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (user.value) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

onMounted(async () => {
  const diag: CallbackDiag = {}
  await consumeImplicitFragment(diag)
  await consumePkceCode(diag)
  const ok = await pollForSession()
  if (!ok) {
    // Tells "no session at all" apart from "session exists but the user ref
    // never caught up" (the getClaims() round trip failed or timed out).
    diag.hasSession = Boolean((await client.auth.getSession()).data.session)
    reportAuthError(diag)
    error.value = 'Anmeldung konnte nicht abgeschlossen werden. Bitte fordere einen neuen Link an.'
    return
  }
  await finalize()
})
</script>

<template>
  <div class="text-center py-16">
    <p v-if="!error" class="text-neutral-500">Melde dich an…</p>
    <p v-else class="text-red-700" role="alert">{{ error }}</p>
  </div>
</template>
