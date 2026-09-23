# Data Model: Trainingspunkte & Trainingsfotos (Round 2, Multi-Tenant)

**Feature**: 001-points-and-photos
**Date**: 2026-09-10 (regenerated after Round-2 clarify)

All tables live in the `public` schema unless noted. Every table has RLS
enabled; policies are summarized in
[contracts/rls-policies.md](./contracts/rls-policies.md). Every mutable
row carries the audit fields `created_at`, `created_by`, `last_updated_at`,
`last_updated_by` unless explicitly noted.

Two helper functions gate every team-scoped policy:

```sql
create or replace function public.is_member(p_team uuid) returns boolean
  language sql stable
as $$ select exists (select 1 from public.memberships
  where team_id = p_team and user_id = auth.uid()) $$;

create or replace function public.is_trainer(p_team uuid) returns boolean
  language sql stable
as $$ select exists (select 1 from public.memberships
  where team_id = p_team and user_id = auth.uid() and role = 'trainer') $$;
```

---

## teams

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `name` | `text` | `not null` | |
| `slug` | `text` | `not null unique` | URL identifier; lowercased ASCII/dash |
| `created_by` | `uuid` | `not null references auth.users(id)` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| `last_updated_at` | `timestamptz` | `not null default now()` | trigger-updated |
| `last_updated_by` | `uuid` | `references auth.users(id)` | |

Index: `create unique index teams_slug_uniq on teams(slug);` (implicit
from `unique`).

## memberships

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `user_id` | `uuid` | `references auth.users(id) on delete cascade` | |
| `team_id` | `uuid` | `references teams(id) on delete cascade` | |
| `role` | `text` | `not null check (role in ('trainer','player'))` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| — | — | `primary key (user_id, team_id)` | Composite PK |

Guard trigger `prevent_last_trainer_change` (`before update or delete
on memberships`): raises if the operation would leave the referenced
team with zero `trainer`-role memberships.

Indexes:

- `create index memberships_team_idx on memberships(team_id);`
- `create index memberships_user_idx on memberships(user_id);`

## invitations

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `team_id` | `uuid` | `not null references teams(id) on delete cascade` | |
| `email` | `text` | `not null` | Lower-cased on insert via trigger |
| `role` | `text` | `not null check (role in ('trainer','player'))` | |
| `token` | `text` | `not null unique` | Random 32-char URL-safe |
| `invited_by` | `uuid` | `not null references auth.users(id)` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| `expires_at` | `timestamptz` | `not null default (now() + interval '14 days')` | A17 |
| `accepted_at` | `timestamptz` | | Nullable until accepted |

Constraint: `unique (team_id, email) where accepted_at is null` — at
most one outstanding invite per (team, email). Insert path revokes any
prior outstanding invite for the same pair.

Index: `create index invitations_email_open_idx on invitations(email) where accepted_at is null;`

## user_profiles (table)

RLS-protected profile projection for display-name reads. The profile row is
created and synchronized by a `security definer` trigger owned by the database
so clients never receive direct access to `auth.users`.

```sql
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text
);

alter table public.user_profiles enable row level security;

create policy user_profiles_read_team on public.user_profiles
  for select to authenticated
  using (public.is_profile_visible(id));
```

`is_profile_visible` returns true only for the caller's own profile or a
profile belonging to a user who shares a team with the caller. No `anon`
policy exists.

## players

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `team_id` | `uuid` | `not null references teams(id) on delete cascade` | |
| `name` | `text` | `not null` | |
| `active` | `boolean` | `not null default true` | |
| `jersey_number` | `int` | | Uniqueness enforced per team via partial unique index below |
| `position` | `text` | | Free-form |
| `linked_user_id` | `uuid` | `references auth.users(id) on delete set null` | See constraint below |
| `photo_consent` | `boolean` | `not null default false` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| `created_by` | `uuid` | `references auth.users(id)` | |
| `last_updated_at` | `timestamptz` | `not null default now()` | trigger-updated |
| `last_updated_by` | `uuid` | `references auth.users(id)` | |

Constraints / indexes:

- `create unique index players_active_jersey_per_team_uniq on players(team_id, jersey_number) where active = true and jersey_number is not null;`
- `create unique index players_linked_user_per_team_uniq on players(team_id, linked_user_id) where linked_user_id is not null;` — 1:1 within a team.
- `create index players_team_idx on players(team_id);`
- Trigger `enforce_player_linked_user_membership` (`before insert or
  update` of `linked_user_id`): asserts the linked user has a
  `player`-role membership in the same `team_id`.

## point_categories

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `team_id` | `uuid` | `not null references teams(id) on delete cascade` | |
| `name` | `text` | `not null` | |
| `active` | `boolean` | `not null default true` | |
| `sort_order` | `int` | `not null` | Lexicographic priority in ranking (FR-051) |
| `value_min` | `int` | `not null` | |
| `value_max` | `int` | `not null check (value_max >= value_min)` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| `created_by` | `uuid` | `references auth.users(id)` | |
| `last_updated_at` | `timestamptz` | `not null default now()` | trigger-updated |
| `last_updated_by` | `uuid` | `references auth.users(id)` | |

Indexes:

- `create unique index point_categories_team_name_uniq on point_categories(team_id, name);`
- `create index point_categories_team_active_sort_idx on point_categories(team_id, active, sort_order);`

## trainings

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `team_id` | `uuid` | `not null references teams(id) on delete cascade` | |
| `date` | `date` | `not null`; database trigger compares it with the current date in `teams.timezone` on insert and update | FR-011 no future date |
| `title` | `text` | | |
| `note` | `text` | | |
| `status` | `text` | `not null default 'draft' check (status in ('draft','saved'))` | |
| `created_at` | `timestamptz` | `not null default now()` | |
| `created_by` | `uuid` | `references auth.users(id)` | |
| `last_updated_at` | `timestamptz` | `not null default now()` | trigger-updated |
| `last_updated_by` | `uuid` | `references auth.users(id)` | |

Indexes: `create index trainings_team_date_idx on trainings(team_id, date desc);`

Photos are optional for a training in every state — no trigger guards the
draft → saved transition against missing photos (dropped in
`20260911130000_drop_photo_requirement.sql`).

`date`, `title` and `note` remain editable after the draft → saved
transition via the same update path used to finalize a draft (FR-014);
the not-future check and RLS (`tr_write_trainer`) apply the same as on
create.

A trainer can delete a training outright (FR-016), covered by the same
`tr_write_trainer` policy (`for all`). The application first records the
photo paths in the trainer-only `training_deletion_jobs` table, then deletes
the training row and its cascading `point_entries` and `training_photos`
rows. It removes the recorded files from the `training-photos` storage bucket
in batches of at most 1,000 and deletes the cleanup job only after that
succeeds. A failed database delete leaves the files and job intact; a failed
Storage delete leaves the job available for a later retry.

## training_photos

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `training_id` | `uuid` | `not null references trainings(id) on delete cascade` | |
| `storage_path` | `text` | `not null unique` | `<team_id>/<training_id>/<uuid>.<ext>` |
| `content_type` | `text` | `not null check (content_type in ('image/jpeg','image/png','image/heic','image/heif','image/webp'))` | FR-043 |
| `size_bytes` | `int` | `not null check (size_bytes > 0 and size_bytes <= 10485760)` | 10 MB, FR-042 |
| `uploaded_by` | `uuid` | `not null references auth.users(id)` | |
| `uploaded_at` | `timestamptz` | `not null default now()` | |

Trigger `enforce_photo_path_team` (`before insert`): asserts the first
segment of `storage_path` equals `training.team_id::text`.

Indexes: `create index training_photos_training_idx on training_photos(training_id);`

## point_entries

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | `primary key default gen_random_uuid()` | |
| `training_id` | `uuid` | `not null references trainings(id) on delete cascade` | |
| `player_id` | `uuid` | `not null references players(id) on delete restrict` | |
| `category_id` | `uuid` | `not null references point_categories(id) on delete restrict` | |
| `value` | `int` | `not null` | Range checked by trigger against category at write time |
| `created_at` | `timestamptz` | `not null default now()` | |
| `created_by` | `uuid` | `references auth.users(id)` | |
| `last_updated_at` | `timestamptz` | `not null default now()` | trigger-updated |
| `last_updated_by` | `uuid` | `references auth.users(id)` | |

Constraints / indexes:

- `unique (training_id, player_id, category_id)`
- `create index point_entries_training_idx on point_entries(training_id);`
- `create index point_entries_player_idx on point_entries(player_id);`

Triggers:

- `enforce_point_entry_range` (`before insert or update`): checks
  `new.value between category.value_min and category.value_max` using
  the category's current range (FR-022).
- `enforce_point_entry_team_consistency` (`before insert or update`):
  asserts `training.team_id = player.team_id = category.team_id`.

## team_settings

Per-team singleton (one row per team). Trainer-only writable.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `team_id` | `uuid` | `primary key references teams(id) on delete cascade` | |
| `season_start` | `date` | `not null default date_trunc('year', current_date)::date` | A4 (per team now) |
| `updated_at` | `timestamptz` | `not null default now()` | |
| `updated_by` | `uuid` | `references auth.users(id)` | |

Row is inserted automatically by a `after insert on teams` trigger with
defaults.

## Derived functions (views)

Written in migrations under `supabase/migrations/…_functions.sql`:

- `public.get_team_ranking(p_team uuid, p_from date, p_to date) returns
  jsonb` — lexicographic sort by category `sort_order`, `sum(value)
  desc`; ties via competition `rank()`. Uses `is_member(p_team)` as a guard;
  returns null if not a member.
- `public.get_player_scores_by_category(p_team uuid, p_player uuid,
  p_from date, p_to date) returns setof …` — one row per
  `(category_id, sum, avg, median)` for the player and timeframe.
- `public.get_public_ranking(p_slug text, p_from date, p_to date)
  returns jsonb` — `security definer` owned by a constrained read-only role,
  resolves slug internally, never
  returns team `id` or player names. Grant `execute` to `anon,
  authenticated`.

## Storage bucket `training-photos`

- **Private** bucket.
- Object keys are `<team_id>/<training_id>/<uuid>.<ext>`.
- Read policy: `bucket_id = 'training-photos' AND EXISTS (SELECT 1 FROM
  public.trainings t WHERE t.id::text = (storage.foldername(name))[2]
  AND t.team_id::text = (storage.foldername(name))[1] AND
  public.is_member(t.team_id) AND (t.status = 'saved' OR
  public.is_trainer(t.team_id)))`.
- Insert/update/delete policy: same training-ID and team-ID checks, but
  `is_trainer(t.team_id)` is required.
- Bucket `allowed_mime_types`: `image/jpeg`, `image/png`, `image/heic`,
  `image/heif`, `image/webp`; `file_size_limit` is 10 MB.

## Sequence of migrations (execution order for `/speckit-tasks`)

1. `20260910120000_init_teams.sql` — `teams`, `memberships`,
   `invitations`.
2. `20260910120500_helpers.sql` — `is_member`, `is_trainer`,
   RLS-protected `user_profiles` table and profile sync trigger.
3. `20260910121000_team_scoped_tables.sql` — `players`,
   `point_categories`, `trainings`, `training_photos`, `point_entries`,
   `team_settings`.
4. `20260910121500_triggers.sql` — audit, range, photo-required,
   team-consistency, path, membership guard triggers.
5. `20260910122000_rls_enable.sql` — `alter table … enable row level
   security` for every base table.
6. `20260910122500_rls_policies.sql` — every policy in one file for
   easier review (or split by table, see contract file).
7. `20260910123000_storage_photos.sql` — bucket + policies.
8. `20260910123500_functions.sql` — `get_team_ranking`,
   `get_player_scores_by_category`, `get_public_ranking` + grants.
9. `20260910124000_seed_fixtures.sql` — seed only for local dev.
10. `20260923100000_training_deletion_cleanup.sql` — durable training
    deletion jobs and post-delete Storage cleanup policy.
