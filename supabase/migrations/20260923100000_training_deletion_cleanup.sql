-- Keep cross-service training deletion recoverable until Storage cleanup succeeds.

create table public.training_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  storage_paths text[] not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint training_deletion_jobs_training_unique unique (training_id)
);

create index training_deletion_jobs_team_idx
  on public.training_deletion_jobs(team_id);

alter table public.training_deletion_jobs enable row level security;

create policy training_deletion_jobs_trainer_read on public.training_deletion_jobs
  for select to authenticated
  using (public.is_trainer(team_id));

create policy training_deletion_jobs_trainer_insert on public.training_deletion_jobs
  for insert to authenticated
  with check (
    public.is_trainer(team_id)
    and exists (
      select 1
        from public.trainings training
       where training.id = public.training_deletion_jobs.training_id
         and training.team_id = public.training_deletion_jobs.team_id
    )
  );

create policy training_deletion_jobs_trainer_delete on public.training_deletion_jobs
  for delete to authenticated
  using (public.is_trainer(team_id));

-- Once the training row is deleted, the regular storage policy can no longer
-- authorize cleanup. The durable job authorizes only its exact recorded paths.
create policy tphoto_cleanup_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'training-photos'
    and exists (
      select 1
        from public.training_deletion_jobs job
       where job.training_id::text = (storage.foldername(name))[2]
         and job.team_id::text = (storage.foldername(name))[1]
         and public.is_trainer(job.team_id)
         and name = any(job.storage_paths)
    )
  );
