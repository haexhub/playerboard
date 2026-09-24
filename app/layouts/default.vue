<script setup lang="ts">
import { Menu } from '@lucide/vue'
import TeamSwitcher from '~/components/team/TeamSwitcher.vue'

const user = useSupabaseUser()
const { signOut, signOutError } = useAuth()

const { currentSlug, isTrainer } = useTeamContext()
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b bg-card sticky top-0 z-30">
      <div class="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
        <NuxtLink
          v-if="currentSlug"
          :to="`/t/${currentSlug}`"
          class="font-semibold text-foreground truncate"
        >
          ifa-board
        </NuxtLink>
        <span v-else class="font-semibold text-foreground">ifa-board</span>

        <div class="flex items-center gap-2">
          <TeamSwitcher v-if="currentSlug" />
          <span v-if="user?.email" class="text-sm text-muted-foreground hidden sm:inline">
            {{ user.email }}
          </span>
          <ShadcnSheet>
            <ShadcnSheetTrigger as-child>
              <ShadcnButton type="button" variant="outline" size="icon">
                <Menu class="size-4" />
                <span class="sr-only">Menü öffnen</span>
              </ShadcnButton>
            </ShadcnSheetTrigger>
            <ShadcnSheetContent side="left" class="flex flex-col gap-0">
              <ShadcnSheetHeader>
                <ShadcnSheetTitle>Menü</ShadcnSheetTitle>
                <ShadcnSheetDescription>Navigation und Konto</ShadcnSheetDescription>
              </ShadcnSheetHeader>
              <nav class="flex flex-col gap-1 px-4">
                <template v-if="currentSlug">
                  <ShadcnSheetClose as-child>
                    <ShadcnButton as-child variant="ghost" class="justify-start">
                      <NuxtLink :to="`/t/${currentSlug}/ranking`">Vollständige Rangliste</NuxtLink>
                    </ShadcnButton>
                  </ShadcnSheetClose>
                  <ShadcnSheetClose as-child>
                    <ShadcnButton as-child variant="ghost" class="justify-start">
                      <NuxtLink :to="`/t/${currentSlug}/trainings`">Trainings</NuxtLink>
                    </ShadcnButton>
                  </ShadcnSheetClose>
                  <ShadcnSheetClose as-child>
                    <ShadcnButton as-child variant="ghost" class="justify-start">
                      <NuxtLink :to="`/t/${currentSlug}/analytics`">Veo-Analytics</NuxtLink>
                    </ShadcnButton>
                  </ShadcnSheetClose>
                  <template v-if="isTrainer">
                    <ShadcnSheetClose as-child>
                      <ShadcnButton as-child variant="ghost" class="justify-start">
                        <NuxtLink :to="`/t/${currentSlug}/team/members`">Mitglieder</NuxtLink>
                      </ShadcnButton>
                    </ShadcnSheetClose>
                    <ShadcnSheetClose as-child>
                      <ShadcnButton as-child variant="ghost" class="justify-start">
                        <NuxtLink :to="`/t/${currentSlug}/categories`">Kategorien</NuxtLink>
                      </ShadcnButton>
                    </ShadcnSheetClose>
                    <ShadcnSheetClose as-child>
                      <ShadcnButton as-child variant="ghost" class="justify-start">
                        <NuxtLink :to="`/t/${currentSlug}/players`">Spieler</NuxtLink>
                      </ShadcnButton>
                    </ShadcnSheetClose>
                    <ShadcnSheetClose as-child>
                      <ShadcnButton as-child variant="ghost" class="justify-start">
                        <NuxtLink :to="`/t/${currentSlug}/team/settings`">Einstellungen</NuxtLink>
                      </ShadcnButton>
                    </ShadcnSheetClose>
                  </template>
                </template>
                <ShadcnSheetClose as-child>
                  <ShadcnButton as-child variant="ghost" class="justify-start">
                    <NuxtLink to="/profile">Profil</NuxtLink>
                  </ShadcnButton>
                </ShadcnSheetClose>
              </nav>
              <ShadcnSheetFooter>
                <ShadcnSheetClose as-child>
                  <ShadcnButton type="button" variant="outline" @click="signOut">
                    Abmelden
                  </ShadcnButton>
                </ShadcnSheetClose>
              </ShadcnSheetFooter>
            </ShadcnSheetContent>
          </ShadcnSheet>
        </div>
      </div>
      <p v-if="signOutError" class="px-4 pb-2 text-center text-sm text-destructive" role="alert">
        {{ signOutError }}
      </p>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
