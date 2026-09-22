// T040: current team context (slug from URL) + list of user's memberships.

import { computed } from 'vue'
import type { Database } from '~/types/database'

export const useTeamContext = () => {
  const route = useRoute()
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const currentSlug = computed<string | null>(
    () => (route.params as { slug?: string }).slug ?? null,
  )

  const { data: memberships, refresh } = useAsyncData(
    'my-memberships',
    async () => {
      if (!user.value) return []
      const query = client
        .from('memberships')
        .select('team_id, role, teams (id, name, slug)')
      const { data, error } = await query.eq('user_id', user.value.sub)
      if (error) throw error
      return data ?? []
    },
    // Watch the user id, not the ref: @nuxtjs/supabase assigns a fresh claims
    // object on every page:start, which would refetch on each navigation.
    { watch: [() => user.value?.sub] },
  )

  const currentMembership = computed(() => {
    const slug = currentSlug.value
    if (!slug) return null
    return memberships.value?.find((m) => m.teams?.slug === slug) ?? null
  })

  const currentTeam = computed(() => currentMembership.value?.teams ?? null)
  const isTrainer = computed(() => currentMembership.value?.role === 'trainer')

  return {
    currentSlug,
    currentTeam,
    currentMembership,
    isTrainer,
    memberships,
    refresh,
  }
}
