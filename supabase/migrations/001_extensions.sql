-- 001 — Extensions and global helpers.
--
-- Supabase installs extensions into the `extensions` schema and puts it on the
-- search path, so `gen_random_uuid()` and `vector` resolve without qualification.

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "vector"    with schema extensions;

-- Applied by trigger to every table carrying `updated_at`.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Attaches the trigger without repeating the boilerplate nineteen times.
create or replace function public.attach_updated_at(target regclass)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trigger_name text := 't_' || replace(target::text, 'public.', '') || '_updated';
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = target and tgname = trigger_name
  ) then
    execute format(
      'create trigger %I before update on %s for each row execute function public.set_updated_at()',
      trigger_name, target
    );
  end if;
end $$;
