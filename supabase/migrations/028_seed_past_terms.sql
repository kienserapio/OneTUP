-- 028 — Past terms, so imported grades have somewhere to land.
--
-- The ERS grades page shows every semester a student has ever taken, which is
-- the whole reason the grades import is worth having. Those grades hang off an
-- enrollment, an enrollment needs a term, and `019` seeded exactly three: the
-- current one and its two immediate neighbours. A fourth-year student importing
-- their record has nowhere to put three years of it.
--
-- No start or end dates are seeded. The academic calendar for past years is not
-- something we hold, and a made-up date would be indistinguishable from a real
-- one everywhere it is later read. Ordering falls back to
-- `academic_year || ordinal`, which is exactly what the client already does
-- when a term has no `starts_on`.

do $$
declare
  start_year int;
begin
  -- Six academic years back covers a student who started as a freshman, took a
  -- leave, and came back — which is common enough to be worth the twenty rows.
  for start_year in 2019..2026 loop
    insert into public.terms (code, label, academic_year, ordinal, is_current)
    values
      (format('%s-%s-1', start_year, start_year + 1),
       format('1st Semester AY %s-%s', start_year, start_year + 1),
       format('%s-%s', start_year, start_year + 1), 1, false),
      (format('%s-%s-2', start_year, start_year + 1),
       format('2nd Semester AY %s-%s', start_year, start_year + 1),
       format('%s-%s', start_year, start_year + 1), 2, false),
      (format('%s-%s-3', start_year, start_year + 1),
       format('Summer AY %s-%s', start_year, start_year + 1),
       format('%s-%s', start_year, start_year + 1), 3, false)
    on conflict (code) do nothing;
  end loop;
end $$;


-- --- Grade imports are their own kind of sync job ------------------------
--
-- Kept distinct from `schedule_import` so a failed grades run is legible in the
-- job log without joining anything, and so the concurrency cap can tell the two
-- apart if they ever need different limits.

-- Dropped by what it says rather than by its name: an inline column check gets
-- its name from Postgres, and a rename would leave the old constraint in place
-- and silently rejecting every grades import.
do $$
declare
  existing text;
begin
  for existing in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'sync_jobs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%schedule_resync%'
  loop
    execute format('alter table public.sync_jobs drop constraint %I', existing);
  end loop;
end $$;

alter table public.sync_jobs add constraint sync_jobs_kind_check
  check (kind in ('schedule_import','schedule_resync','grades_import'));

drop index if exists public.idx_sync_rate_limit;
create index idx_sync_rate_limit on public.sync_jobs (user_id, created_at desc)
  where kind in ('schedule_import','schedule_resync','grades_import');
