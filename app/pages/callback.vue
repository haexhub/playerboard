<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AuthError } from '@supabase/supabase-js'
import { POST_LOGIN_REDIRECT_KEY } from '~/composables/useAuth'
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
  implicitError?: AuthErrorInfo
  pkceError?: AuthErrorInfo
}

const describeAuthError = (err: AuthError): AuthErrorInfo => ({
  message: err.message,
  status: err.status,
  code: err.code,
  name: err.name,
})

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

const readStoredRedirect = (): string | null => {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(POST_LOGIN_REDIRECT_KEY)
  localStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
  if (!raw) return null
  if (!raw.startsWith('/') || raw[1] === '/' || raw[1] === '\\') return null
  return raw
}

const finalize = async () => {
  const rawRedirect = route.query.redirect
  const queryRedirect =
    typeof rawRedirect === 'string' &&
    rawRedirect.startsWith('/') &&
    rawRedirect[1] !== '/' &&
    rawRedirect[1] !== '\\'
      ? rawRedirect
      : null
  const redirect = queryRedirect ?? readStoredRedirect()

  if (redirect) {
    await navigateTo(redirect, { replace: true })
    return
  }

  if (!user.value) return
  const { data } = await client
    .from('memberships')
    .select('teams(slug)')
    .eq('user_id', user.value.sub)

  const slugs = (data ?? []).map((m) => m.teams?.slug).filter((s): s is string => Boolean(s))
  const lastSlug = import.meta.client ? localStorage.getItem('ifa:lastSlug') : null
  const target = lastSlug && slugs.includes(lastSlug) ? lastSlug : (slugs[0] ?? null)

  if (target) {
    await navigateTo(`/t/${target}`, { replace: true })
  } else {
    await navigateTo('/start', { replace: true })
  }
}

const consumeImplicitFragment = async (diag: CallbackDiag): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  diag.hasHash = Boolean(hash && hash.includes('access_token='))
  if (!diag.hasHash) return false
  const params = new URLSearchParams(hash.slice(1))
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
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return true
}

const consumePkceCode = async (diag: CallbackDiag): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const code = new URLSearchParams(window.location.search).get('code')
  diag.hasCode = Boolean(code)
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
    reportAuthError(diag)
    error.value =
      'Anmeldung konnte nicht abgeschlossen werden. Bitte fordere einen neuen Link an.'
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
