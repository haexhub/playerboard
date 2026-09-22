<script setup lang="ts">
const user = useSupabaseUser()
const { signOut, signOutError } = useAuth()
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <header class="border-b bg-white">
      <div class="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
        <span class="font-semibold text-neutral-900">ifa-board</span>
        <button
          v-if="user"
          type="button"
          class="min-h-touch px-3 rounded border border-neutral-300 text-sm hover:bg-neutral-100"
          @click="signOut"
        >
          Abmelden
        </button>
      </div>
      <p v-if="signOutError" class="px-4 pb-2 text-center text-sm text-red-700" role="alert">
        {{ signOutError }}
      </p>
    </header>
    <main class="mx-auto max-w-2xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>
