-- 016 — Operational tables: sync jobs, AI runs, audit log, moderation, push.
--
-- Two hard constraints are visible in this file:
--
--   * `sync_jobs` has no column that could hold a credential, and `error_detail`
--     is sanitised before it is written. The schema check in scripts/db.mjs
--     fails the build if a credential-shaped column is ever added anywhere.
--   * `ai_runs` records metadata only. No prompt, no completion, no content.

create table public.sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('schedule_import','schedule_resync')),
  status         text not null default 'queued'
                 check (status in ('queued','running','succeeded','failed')),
  importer       text not null default 'ers_worker'
                 check (importer in ('ers_worker','paste','extension','sanctioned_api')),
  parser_version text,
  rows_parsed    smallint,
  rows_failed    smallint,
  error_code     text,
  error_detail   text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

comment on column public.sync_jobs.error_detail is
  'Sanitised before write. A credential-shaped value must never reach this column.';

alter table public.sync_jobs enable row level security;
create policy sync_read_own on public.sync_jobs
  for select using ((select auth.uid()) = user_id);

create index idx_sync_user on public.sync_jobs (user_id, created_at desc);
create index idx_sync_rate_limit on public.sync_jobs (user_id, created_at desc)
  where kind in ('schedule_import','schedule_resync');


create table public.ai_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  capability     text not null,
  model          text not null,
  prompt_version text not null,
  input_hash     text not null,
  cache_hit      boolean not null default false,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  status         text not null check (status in ('ok','invalid_output','error','refused')),
  error_code     text,
  created_at     timestamptz not null default now()
);

alter table public.ai_runs enable row level security;
create policy ai_runs_read_own on public.ai_runs
  for select using ((select auth.uid()) = user_id);

create index idx_ai_runs_cache on public.ai_runs (capability, input_hash, prompt_version);
create index idx_ai_runs_user on public.ai_runs (user_id, created_at desc);


-- The response cache. Keyed by capability, prompt version and a hash of the
-- canonicalised input, so the same announcement shared by fifteen classmates is
-- one model call. This is the main lever keeping the product inside free tiers.
create table public.ai_cache (
  cache_key      text primary key,
  capability     text not null,
  prompt_version text not null,
  output         jsonb not null,
  model          text not null,
  hit_count      integer not null default 0,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days'
);

alter table public.ai_cache enable row level security;
-- Service role only. The cache holds other students' extractions; nothing about
-- it should be reachable from a client.
create policy ai_cache_no_client_access on public.ai_cache for select using (false);

create index idx_ai_cache_expiry on public.ai_cache (expires_at);


create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  actor       text not null default 'user' check (actor in ('user','system','assistant')),
  reason      text,
  reversible  boolean not null default true,
  reverted_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on column public.audit_log.reason is
  'Powers the receipt shown beside an automated action: '
  '"Added because your class representative posted this at 11:42 PM."';

alter table public.audit_log enable row level security;
create policy audit_read_own on public.audit_log
  for select using ((select auth.uid()) = user_id);

create index idx_audit_user on public.audit_log (user_id, created_at desc);


create table public.moderation_queue (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  entity_id   uuid not null,
  reason      text not null,
  reported_by uuid references auth.users(id) on delete set null,
  status      text not null default 'open'
              check (status in ('open','resolved','dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.moderation_queue enable row level security;
create policy moderation_insert on public.moderation_queue
  for insert to authenticated with check (reported_by = (select auth.uid()));
create policy moderation_read_own on public.moderation_queue
  for select using (reported_by = (select auth.uid()));

create index idx_moderation_open on public.moderation_queue (created_at desc)
  where status = 'open';


create table public.notification_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth_key     text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);

alter table public.notification_subscriptions enable row level security;
create policy subs_all_own on public.notification_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- Rate limiting lives in the database rather than in memory so it survives a
-- serverless cold start. The import limit is what stops OneTUP being usable as
-- a credential-testing oracle against ERS (auth doc §6).
create table public.rate_limit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  bucket     text not null,
  outcome    text not null default 'ok' check (outcome in ('ok','failure')),
  created_at timestamptz not null default now()
);

alter table public.rate_limit_events enable row level security;
create policy rate_limit_no_client_access on public.rate_limit_events for select using (false);

create index idx_rate_limit_lookup on public.rate_limit_events (user_id, bucket, created_at desc);
