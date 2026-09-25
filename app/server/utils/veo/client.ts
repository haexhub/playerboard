import { z } from 'zod'

const VEO_API_BASE = 'https://app.veo.co/api/app'

// Shape of one GET .../matches/ item as far as the sync relies on it. Veo's
// API is private and undocumented, so anything it stops sending fails the
// sync here instead of surfacing as a driver error or a bogus row.
const veoMatchListItemSchema = z.object({
  identifier: z.string(),
  start: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'unparseable start'),
  title: z.string(),
  opponent_team_name: z.string(),
  has_analytics_enabled: z.boolean(),
  own_team_home_or_away: z.enum(['home', 'away']),
  // Nested `team.id`, not a flattened `team__id` — the API stopped honoring
  // the `fields=` sparse-fieldset selection at some point and now always
  // returns the full nested `team` object (confirmed against a live sync
  // failure, "Unexpected Veo matches response shape", 2026-09-25).
  team: z.object({ id: z.string() }),
  info: z
    .object({
      stats: z
        .object({
          score_aggregated: z.object({
            own: z.number().nullable(),
            opponent: z.number().nullable(),
          }),
        })
        .nullable(),
    })
    .nullable(),
})

export type VeoMatchListItem = z.infer<typeof veoMatchListItemSchema>

const veoFetch = async <T>(accessToken: string, path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${VEO_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`Veo API request failed: ${init?.method ?? 'GET'} ${path} -> ${res.status}`)
  }
  return (await res.json()) as T
}

const MATCH_LIST_FIELDS = [
  'identifier',
  'start',
  'title',
  'opponent_team_name',
  'has_analytics_enabled',
  'own_team_home_or_away',
  'team',
  'info',
]

/** Validates a raw `.../matches/` response — exported separately so it can be
 * unit-tested against a captured fixture without a real Veo session. */
export const parseMatchListResponse = (json: unknown): VeoMatchListItem[] => {
  const parsed = z.array(veoMatchListItemSchema).safeParse(json)
  if (!parsed.success) {
    throw new Error('Unexpected Veo matches response shape')
  }
  return parsed.data
}

/** GET .../api/app/matches/ for one Veo club/team, newest first. */
export const listMatches = async (
  accessToken: string,
  params: { veoClubSlug: string; veoTeamSlug: string },
): Promise<VeoMatchListItem[]> => {
  const query = new URLSearchParams({
    team: params.veoTeamSlug,
    club: params.veoClubSlug,
    ordering: '-created',
    page_size: '50',
    analytics_version: '2',
  })
  for (const field of MATCH_LIST_FIELDS) query.append('fields', field)
  const json = await veoFetch<unknown>(accessToken, `/matches/?${query.toString()}`)
  return parseMatchListResponse(json)
}

/** POST .../api/app/analysis/stats/ for a batch of matches of one Veo team. */
export const fetchAnalysisStats = async (
  accessToken: string,
  params: { veoTeamId: string; veoMatchIds: string[] },
): Promise<unknown> =>
  veoFetch(accessToken, '/analysis/stats/', {
    method: 'POST',
    body: JSON.stringify({
      type: 'team_match',
      team_id: params.veoTeamId,
      match_ids: params.veoMatchIds,
      group_by: 'team_association',
    }),
  })

// Shapes confirmed live during Phase 7 research (research.md §10) against a
// real, already-authenticated session — not from Veo's own documentation
// (there is none for this private API).
const veoClubSchema = z.object({
  slug: z.string(),
  name: z.string(),
})

const veoTeamSchema = z.object({
  slug: z.string(),
  name: z.string(),
})

export type VeoClub = z.infer<typeof veoClubSchema>
export type VeoTeam = z.infer<typeof veoTeamSchema>

/** POST .../api/app/analysis/stats/ for a batch of matches, grouped by
 * player instead of team association. `team_id` IS required here despite
 * research.md §1's original assumption — confirmed by capturing the real
 * request the Veo web app itself sends (2026-09-25); omitting it fails with
 * HTTP 400. */
export const fetchPlayerAnalysisStats = async (
  accessToken: string,
  params: { veoTeamId: string; veoMatchIds: string[] },
): Promise<unknown> =>
  veoFetch(accessToken, '/analysis/stats/', {
    method: 'POST',
    body: JSON.stringify({
      type: 'cross_match',
      team_id: params.veoTeamId,
      group_by: 'player',
      match_ids: params.veoMatchIds,
    }),
  })

/** GET .../api/app/clubs/?filter=own — every club the token's Veo user
 * belongs to. Used only by the trainer-initiated linking flow
 * (`POST /api/veo/login`), never by the daily sync. */
export const listOwnClubs = async (accessToken: string): Promise<VeoClub[]> => {
  const query = new URLSearchParams({ page_size: '500', filter: 'own' })
  for (const field of ['slug', 'name', 'team_count', 'is_club_admin']) query.append('fields', field)
  const json = await veoFetch<unknown>(accessToken, `/clubs/?${query.toString()}`)
  const parsed = z.array(veoClubSchema).safeParse(json)
  if (!parsed.success) {
    throw new Error('Unexpected Veo clubs response shape')
  }
  return parsed.data
}

/** GET .../api/app/clubs/{club_slug}/teams/ — every team within one club.
 * Used only by the trainer-initiated linking flow. */
export const listClubTeams = async (accessToken: string, clubSlug: string): Promise<VeoTeam[]> => {
  const query = new URLSearchParams()
  for (const field of ['slug', 'name', 'match_count']) query.append('fields', field)
  const json = await veoFetch<unknown>(accessToken, `/clubs/${clubSlug}/teams/?${query.toString()}`)
  const parsed = z.array(veoTeamSchema).safeParse(json)
  if (!parsed.success) {
    throw new Error('Unexpected Veo teams response shape')
  }
  return parsed.data
}
