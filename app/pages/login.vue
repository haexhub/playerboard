<script setup lang="ts">
import { computed } from 'vue'
import LoginMagicLink from '~/components/auth/LoginMagicLink.vue'
import { safeInternalPath } from '~/composables/useAuth'

definePageMeta({
  layout: 'onboarding',
})

const route = useRoute()
const redirect = computed(() => safeInternalPath(route.query.redirect) ?? undefined)
const initialEmail = computed(() => {
  const raw = route.query.email
  return typeof raw === 'string' ? raw : undefined
})
</script>

<template>
  <section class="space-y-6 py-6">
    <div class="relative h-48 overflow-hidden rounded-xl border border-border sm:h-56">
      <img
        src="/images/hero-training.jpg"
        alt="Junger Spieler schießt eine Ecke auf dem Trainingsplatz"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <div class="absolute inset-0 bg-linear-to-t from-black/70 via-black/5 to-transparent"></div>
      <p class="absolute inset-x-0 bottom-0 px-3 py-1.5 text-right text-[11px] text-white/70">
        Foto:
        <a
          href="https://commons.wikimedia.org/wiki/User:W.carter"
          target="_blank"
          rel="noopener"
          class="underline hover:text-white"
          >W.carter</a
        >,
        <a
          href="https://commons.wikimedia.org/wiki/File:Boy_taking_a_corner_kick_during_a_little_league_soccer_game_in_Brastad_arena.jpg"
          target="_blank"
          rel="noopener"
          class="underline hover:text-white"
          >Wikimedia Commons</a
        >
        (<a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener"
          class="underline hover:text-white"
          >CC BY-SA 4.0</a
        >, zugeschnitten)
      </p>
    </div>
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Anmelden</h1>
      <p class="text-neutral-600">Wir schicken dir einen Anmelde-Link per E-Mail.</p>
    </header>
    <LoginMagicLink :initial-email="initialEmail" :redirect-to="redirect" />
  </section>
</template>
