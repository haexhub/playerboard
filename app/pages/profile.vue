<script setup lang="ts">
import AccountDeleteCard from '~/components/profile/AccountDeleteCard.vue'
import ProfileForm from '~/components/profile/ProfileForm.vue'
import { useProfile } from '~/composables/useProfile'

const { getOwnProfile } = useProfile()

const {
  data: profile,
  error: loadError,
  refresh,
} = await useAsyncData('own-profile', getOwnProfile)
</script>

<template>
  <section class="max-w-md space-y-6" data-testid="profile-page">
    <header>
      <h1 class="text-2xl font-semibold text-neutral-900">Profil</h1>
    </header>
    <p v-if="loadError" class="text-sm text-red-700" role="alert">
      Profil konnte nicht geladen werden: {{ loadError.message }}
    </p>
    <ProfileForm
      v-else-if="profile"
      :display-name="profile.display_name"
      :avatar-url="profile.avatar_url"
      @saved="refresh"
    />
    <AccountDeleteCard />
  </section>
</template>
