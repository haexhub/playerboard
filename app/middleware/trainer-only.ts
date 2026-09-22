// T035: trainer-only guard for team-scoped routes.
// Requires trainer membership in the current slugged team. It subsumes the
// team-context guard (non-member -> /start, player -> team dashboard), so
// trainer pages declare only this middleware and pay for one membership
// lookup per navigation instead of two.

export default defineNuxtRouteMiddleware(async (to) => {
  const slug = (to.params as { slug?: string }).slug
  if (!slug) return

  const client = useSupabaseClient()
  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/login')

  const { data, error } = await client
    .from('memberships')
    .select('role, teams!inner(slug)')
    .eq('teams.slug', slug)
    .eq('user_id', user.value.sub)
    .maybeSingle()

  if (error || !data) return navigateTo('/start')
  if (data.role !== 'trainer') return navigateTo(`/t/${slug}/dashboard`)
})
