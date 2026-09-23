# Phase 0 Research: Veo-Spieler-Statistiken

Everything below builds directly on 003-veo-analytics' research.md, which is
not repeated here. Only what's new or different for player-level stats is
recorded.

## 1. Fetching player stats: same endpoint, different parameters

**Decision**: Add `fetchPlayerAnalysisStats(accessToken, { veoMatchIds })` to
`app/server/utils/veo/client.ts`, calling the same
`POST app.veo.co/api/app/analysis/stats/` endpoint the existing
`fetchAnalysisStats()` already uses for team stats, with:

```json
{ "type": "cross_match", "group_by": "player", "match_ids": ["<one match id>"] }
```

No `team_id` field is needed for this variant (confirmed live during the
prior research session referenced in the `/speckit.specify` input for this
feature) — unlike the team-level call, which requires `team_id` alongside
`match_ids`.

**Rationale**: Reuses the exact HTTP client, auth header, and error-handling
shape already in `client.ts` — no new fetch wrapper, no new endpoint.

## 2. Player-stats response shape

**Decision**: The response wrapper is assumed structurally identical to the
already-implemented team-stats response (`{ items: [...] }`, each item
carrying a `stats: [{ type, value, category: { id }, periods }]` array — see
`app/server/utils/veo/mapStats.ts`), with the per-item discriminator being a
`player` object instead of a bare `team_association` string:

```json
{
  "items": [
    {
      "player": {
        "jersey_number": "7",
        "first_name": null,
        "last_name": null,
        "known_name": null
      },
      "stats": [
        { "type": "distance_total_meters", "value": 8532.4, "category": { "id": "physical" }, "periods": [...] },
        { "type": "sprints_total", "value": 14, "category": { "id": "physical" }, "periods": [...] }
      ]
    }
  ]
}
```

**Evidence**: field names and the "one entry per jersey number active in the
match, ~31 values, names are null" fact come from live research against the
real Veo account performed for this feature's `/speckit.specify` input
(explicitly marked "already verified live, do not re-research"). The exact
JSON nesting shown above (a `player` sub-object vs. a top-level
`jersey_number` field) is **inferred by symmetry** with the team-level
response this project already parses successfully, not itself re-verified
live per that same instruction.

**Risk accepted / follow-up**: `mapPlayerStats.ts`'s Zod schema is written
against this inferred shape. Because the input is `unknown` and parsed with
`.safeParse()` (same fail-closed pattern as `mapStats.ts`), a shape mismatch
fails the sync for that match with a clear "Unexpected Veo player-stats
response shape" error (surfaced via `veo_sync_status.last_error`, same as any
other sync failure) rather than corrupting data. The fixture used for the
unit test should be replaced with a real captured payload at the start of
implementation (tasks.md), the same way `tests/fixtures/veo/analysis-stats-response.json`
was captured for the team-level feature — a five-minute check, not a design
question.

**Alternatives considered**: Re-run live browser research now to nail the
exact shape — rejected per this feature's explicit brief not to re-research
already-confirmed feasibility; the fail-closed parsing above makes a wrong
guess a loud sync error, not silent data corruption, so the cost of being
wrong is low and cheaply caught during implementation.

## 3. Curated stat types (FR-001, FR-008)

**Decision**: A fixed list of nine Veo `type` keys is kept; everything else
in each player's `stats` array is dropped:

| Veo `type` | Meaning |
|---|---|
| `distance_total_meters` | zurückgelegte Distanz |
| `sprints_total` | Anzahl Sprints |
| `top_speed_kmh` | Höchstgeschwindigkeit |
| `average_speed_kmh` | Durchschnittsgeschwindigkeit |
| `high_intensity_runs_total` | hochintensive Läufe |
| `seconds_played_total` | gespielte Zeit |
| `football_shots_total` | Torschüsse |
| `football_goal_total` | Tore |
| `football_goal_involvement_total` | Torbeteiligungen |

**Rationale**: Directly matches FR-001's curated list and the naming
convention Veo already uses for the team-level `stat_type` column
(`football_goal_total` etc. are the same key names at team level). FR-008
requires dropping the other ~22 raw fields Veo returns per player.

## 4. Jersey-number matching scope

**Decision**: Match Veo's `jersey_number` (string) against
`players.jersey_number` (integer) **restricted to players where
`active = true`**, for the team being synced. No match → the row is still
persisted (per §10 below, added after this feature's initial plan), but with
`player_id` left `null` and never displayed, unless a trainer manually
assigns it (User Story 3, FR-011).

**Rationale**: `players` already has a partial unique index,
`players_active_jersey_per_team_uniq`, on `(team_id, jersey_number) WHERE
active = true AND jersey_number IS NOT NULL` — i.e., the schema already
guarantees at most one *active* player per jersey number per team. Scoping
the match to active players makes the lookup deterministic by construction,
without this feature having to invent its own tie-break rule for the
inactive/active collision case the spec's Edge Cases section flags as
"an existing data inconsistency, not this feature's job to resolve."

**Alternatives considered**: Matching against all players regardless of
`active` — rejected: an inactive player (e.g. someone who left the club
mid-season) could then collide with an active team-mate who was later
assigned the same free number, making the match non-deterministic exactly in
the case the unique index was designed to prevent.

## 5. Roster snapshot timing within a sync run

**Decision**: The active roster (`player.id`, `player.jersey_number`) for a
team is fetched once per team per sync run, before that team's match loop
starts, and reused for every match processed in that run — not re-fetched
per match.

**Rationale**: Matches FR-003's "resolved at sync time" requirement without
adding a per-match DB round-trip; a sync run for one team completes in
seconds, so the roster cannot meaningfully change mid-run. Simplicity First:
one query per team per run, not one per match.

## 6. Where per-player results are displayed (no new query mechanism)

**Decision**: `useVeoAnalytics.ts`'s existing `listMatches()` query (which
already nests `veo_match_stats(...)` under each `veo_matches` row) gains one
more nested relation, `veo_player_match_stats(player_id, veo_jersey_number,
stat_type, category, value, players(name, jersey_number))`, filtered to
`player_id is not null` for the member-facing display. Trainers additionally
use a separate, trainer-only data path that fetches the same match's rows
with `player_id is null` and their `veo_jersey_number` values for correction:

- **User Story 1 (dashboard season summary)**: a new `computePlayerSeasonSummary()`
  function sums `value` by `player_id`/`stat_type` across all fetched
  matches — the exact same on-read-aggregation pattern
  `computeSeasonSummary()` already uses for team stats (003-veo-analytics
  research.md §6).
- **User Story 2 (per-match breakdown)**: each match's assigned
  `veo_player_match_stats` array is passed straight to `VeoMatchCard.vue`.
- **User Story 3 (trainer correction)**: the trainer-only path supplies
  unassigned jersey rows to `VeoMatchCard.vue` without broadening the assigned
  player query or changing the per-player season summary input.

**Rationale**: The member-facing query remains narrow and cannot expose
unassigned rows as player statistics. The trainer-only path is isolated to
the correction UI, while the assigned query continues to use the
fetch-once-aggregate-in-JS approach already validated for team stats. Data
volume (one team, tens of matches, ~16 players × 9 stats each) is trivial for
client-side summation.

**Alternatives considered**: A dedicated `/api/veo/player-stats` read
endpoint or a separate Supabase RPC for the season sum — rejected as an
unneeded abstraction; RLS already gates the plain nested select exactly like
every other team-scoped read in this app (Principle I).

## 7. No per-half breakdown for player stats

**Decision**: Unlike `veo_match_stats` (which stores `period_values` for the
existing own-vs-opponent-per-half team breakdown), `veo_player_match_stats`
stores only the match-total `value` — no periods column.

**Rationale**: Neither user story nor any FR asks for a per-half player
breakdown; the two display surfaces (season summary, per-match totals) both
only need match-level totals. Adding an unused `period_values` column would
be speculative (Principle I).

## 8. Idempotent upserts

**Decision** (revised, see §10): `veo_player_match_stats` uses a composite
primary key `(match_id, veo_jersey_number, stat_type)` — **not**
`player_id`, since `player_id` is now a resolved/overridable attribute, not
part of the row's identity (§10). Upserted via `ON CONFLICT ... DO UPDATE`
inside the same per-match transaction that already upserts the match row and
its team stats; the `player_id` column is updated conditionally (§10) rather
than unconditionally overwritten.

**Rationale**: Matches FR-009 (no duplicate/contradictory rows on repeated
sync) at the schema level, exactly like `veo_match_stats`'s own composite
key (003-veo-analytics research.md §7) — just keyed by Veo's own reported
jersey number instead of the resolved player, since that's the stable
identity Veo itself provides per row. Sharing the transaction with the
existing match/team-stats upsert keeps a partial failure from leaving one of
the writes stale (fail closed, same as today).

## 10. Manual jersey-number correction (User Story 3, added 2026-09-23)

**Decision**: `veo_player_match_stats` is keyed by `(match_id,
veo_jersey_number, stat_type)` with `player_id` as a nullable column, plus a
`matched_manually boolean not null default false` flag. The logical assignment
and the flag are at jersey-number level and are repeated across that jersey
number's stat rows. The sync route always upserts a row for every jersey
number Veo reports (whether or not it currently resolves to a roster player).
On insert, `player_id` is set to the roster match, if any; on conflict,
`player_id` is preserved unchanged regardless of `matched_manually`:

```sql
on conflict (match_id, veo_jersey_number, stat_type) do update set
  category = excluded.category,
  value = excluded.value,
  updated_at = now()
```

A trainer's manual assignment sets `player_id` and `matched_manually = true`
for every `stat_type` row sharing that `(match_id, veo_jersey_number)` in one
statement. Display (dashboard season summary, per-match breakdown) only ever
reads rows where `player_id is not null` — an unmatched, not-yet-assigned
jersey number stays invisible, preserving FR-002/SC-004 exactly as before.

**Rationale**: To let a trainer rescue a *completely* unmatched jersey
number (not just correct a wrong auto-match), the raw per-jersey-number
stats must already be stored somewhere before the correction happens —
otherwise there is nothing to assign. Keying by `veo_jersey_number` instead
of `player_id` makes the row's identity Veo's own stable identifier, with
`player_id` demoted to a resolved/overridable attribute. Preserving
`player_id` on conflict makes
FR-013 ("a manual correction survives future syncs") hold without a second
sync code path. Before inserting a new jersey-number group, sync reserves all
player IDs already assigned to another jersey number in that match (including
manual assignments) and leaves a duplicate auto-match as `player_id = null`;
this preserves FR-016 for new rows as well as for manual corrections.

**Alternatives considered**:
- *A separate `veo_player_match_overrides` table, consulted by the sync
  route before writing `veo_player_match_stats`* — rejected: two tables to
  keep consistent for what is really one fact per (match, jersey number);
  the single-table `matched_manually` flag needs no join and no extra write
  in the sync path.
- *Only allow correcting already-matched rows, drop unmatched jersey numbers
  as before* — rejected: this would satisfy only the "wrong number" half of
  the request ("Spieler hat mal eine andere Nummer") and not the (at least
  as likely) "no one currently has that number" half, which is the more
  common real-world cause of an unresolved jersey number.
- *Re-fetch the raw stats live from Veo when a trainer opens the correction
  UI, instead of persisting unmatched rows* — rejected: adds a live,
  user-interactive dependency on Veo's session/token machinery to a simple
  admin action, and could not work at all once the match falls outside
  whatever retention Veo itself applies; persisting at sync time (already
  fetched, already in hand) is strictly simpler and more reliable.

## 11. Write path: dedicated server route, not an RLS write policy

**Decision**: A trainer's correction goes through a new route,
`POST /api/veo/matches/[matchId]/player-assignment`, authenticated via
`serverSupabaseUser(event)` + `requireTrainer(db, team_id, userId)` (the same
explicit app-level check `POST /api/veo/link` already uses), writing via
`useAdminDb()`. The sync route also writes `player_id` when inserting a new
jersey-number group; this assignment route is the only path that changes an
existing group's assignment. `veo_player_match_stats` gets **no** `insert`/`update`/
`delete` RLS policy for `authenticated` — the existing
`veo_player_match_stats_read_member` `select` policy is untouched.

**Rationale**: A trainer's correction must only ever touch `player_id` and
`matched_manually` for rows they're allowed to see — never `value`,
`category`, or `stat_type`, which must stay exclusively sync-controlled data
(fabrication risk otherwise). Postgres RLS policies apply per-row, not
per-column; expressing "this column, not that one" would need either a
trigger or column-level `GRANT`, neither of which this project uses anywhere
today. A narrow server route with an explicit, hand-written column list is
the same pattern already established for `POST /api/veo/link` and is
trivially auditable — no new abstraction, no new authorization primitive.

**Alternatives considered**: A `with check` RLS policy scoped to
`is_trainer(team_id)` for `update` — rejected per the column-scoping problem
above; a direct PostgREST `update` call from the client would then also be
able to rewrite `value`/`category`, which nothing should be able to do
outside the sync route.

## 12. Where the correction UI lives

**Decision**: The correction control is part of the existing per-match
breakdown on `analytics.vue` (`VeoMatchCard.vue`), trainer-only (`v-if
="isTrainer"`) — not a separate page. For each match, unmatched jersey
numbers with stored-but-unassigned rows are listed alongside the matched
players, each with a "Spieler zuordnen" picker over the team's active
roster; an already-matched player's row gets a "Zuordnung ändern" action for
the "wrong number" correction case.

**Rationale**: This is the same page and the same per-match context a
trainer would already be looking at User Story 2's breakdown on — no new
route, no new navigation entry, and it reuses the existing trainer-only
conditional pattern already used elsewhere in this app (e.g.
`dashboard.vue`'s `v-if="isTrainer"` Veo-link shortcut).

## 13. Sync failure mode for player stats (added 2026-09-23, FR-015)

**Decision**: If `fetchPlayerAnalysisStats` fails for a match, that match's
entire sync (match row + team stats + player stats) is not written for this
run — the same fail-closed behavior as an incomplete Veo analysis
(003-veo-analytics FR-007). Nothing about the per-match transaction changes
to achieve this: `sync.post.ts` already fetches team stats *before* opening
the per-match `db.transaction(...)`; adding the player-stats fetch to that
same pre-transaction step means a failure there throws before the
transaction (and thus the match/team-stats upsert) ever begins.

**Rationale**: Keeps the guarantee spec.md already relies on for team
stats — a member never sees a match with team stats but silently-missing
player stats due to a transient fetch failure, which would be confusing and
impossible to distinguish from "Veo genuinely has no player data for this
match." Retried automatically on the next daily sync, same as any other
fail-closed case.

**Alternatives considered**: Save the match/team stats regardless and only
skip player stats on failure — rejected: introduces a new partial-success
state nothing else in this feature or its predecessor has, and the failure
would silently persist until someone happened to notice a match with no
player stats (no visible error, unlike `veo_sync_status`, which is
per-team, not per-match).

## 14. One player, one jersey number per match (added 2026-09-23, FR-016)

**Decision**: `POST /api/veo/matches/[matchId]/player-assignment` enforces
"at most one jersey number per player per match" transactionally in the
route itself, not via a database constraint. The transaction first locks the
shared `veo_matches` row with `FOR UPDATE`, which is also the lock the sync
uses while reserving existing assignments and inserting new jersey-number
groups. Before setting `player_id` + `matched_manually = true` on every row
sharing the target `(match_id, veo_jersey_number)`, it clears
(`player_id = null`, `matched_manually = true`) any *other* jersey number's
rows in the same match that currently carry that `player_id`. The shared
match-row lock serializes concurrent assignments; an implementation using
Serializable isolation instead MUST retry serialization failures.

**Rationale**: The natural PK, `(match_id, veo_jersey_number, stat_type)`,
already produces nine rows per jersey number (one per curated stat) sharing
one `player_id` — a simple `unique(match_id, player_id)` index would reject
exactly those legitimate sibling rows, not just a genuine second-jersey-number
assignment. Expressing "unique `player_id` per distinct jersey-number group"
as a database constraint would need splitting the table into a
jersey-to-player assignment table plus a separate stat-values table (a real
option, see Alternatives) — more moving parts than this single write path
justifies. Since this table has no RLS write policy at all (research.md
§11), the sync and assignment paths are both server-controlled, and both use
the shared match-row lock, enforcing the invariant covers the whole write
surface; there is no other path (direct PostgREST, another route) that could
violate it. The cleared
row also gets `matched_manually = true` so the next automatic sync doesn't
silently reassign the freed-up jersey number back to the same player if
their `players.jersey_number` still happens to match it.

**Alternatives considered**: Split into `veo_player_match_assignments
(match_id, veo_jersey_number) → player_id` (with a clean partial unique
index on `(match_id, player_id) where player_id is not null`) plus a
separate stat-values table — rejected: adds a second table and a join to
every read (dashboard season summary, per-match breakdown), undoing
research.md §6's assigned-read design, to enforce an invariant that the
server-controlled sync and assignment paths can guarantee with a shared
match-row lock.

## 15. Testing strategy

**Decision**: `mapPlayerStats.ts` is a pure function, unit-tested against a
fixture payload (`tests/fixtures/veo/analysis-stats-player-response.json`) —
same approach as `mapStats.ts`. Cases covered: full curated payload with a
matching roster (all rows get `player_id`), a jersey number with no roster
match (row still returned, `player_id: null`), and a stat `type` outside the
curated list (dropped). The e2e suite seeds `veo_player_match_stats`
directly (no live Veo call) and asserts: the dashboard season summary and
the analytics page's per-match breakdown only show rows with a non-null
`player_id`; `POST /api/veo/matches/[matchId]/player-assignment` sets
`player_id` + `matched_manually` for a trainer and is rejected for a player
account (403); and a simulated re-sync (re-running the upsert with fresh
`category`/`value` but the same `veo_jersey_number`) leaves a
`matched_manually = true` row's `player_id` unchanged (SC-005) — mirroring
003-veo-analytics research.md §8.
