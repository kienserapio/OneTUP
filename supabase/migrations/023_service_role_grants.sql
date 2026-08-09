-- 023 — Service-role privileges, and the one deliberate hole in them.
--
-- The service role bypasses RLS, so what it is *granted* is the only thing
-- standing between a server-side bug and every student's data. It gets what the
-- server genuinely needs — the AI cache, rate limiting, sync jobs, scheduled
-- notifications, moderation — and nothing else.
--
-- Grades and attendance are withheld on purpose. ARD §6.1 says there is no
-- administrative override for a student's academic data; this is that sentence
-- expressed as a privilege rather than as a convention. A future endpoint that
-- tries to read them with the service key fails with "permission denied"
-- instead of quietly working.
--
-- Cascading deletes still reach those tables, because a foreign key cascade
-- runs as the table owner rather than as the caller. Account deletion is
-- therefore complete without granting anything here.

grant usage on schema public to service_role;

do $$
declare
  withheld text[] := array[
    'grades',
    'grade_components',
    'grade_scale_mappings',
    'attendance_records',
    'v_gwa',
    'v_attendance_summary'
  ];
  rel record;
begin
  for rel in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and c.relname <> all (withheld)
  loop
    if rel.relkind = 'v' then
      execute format('grant select on public.%I to service_role', rel.relname);
    else
      execute format('grant select, insert, update, delete on public.%I to service_role', rel.relname);
    end if;
  end loop;
end $$;

grant execute on all functions in schema public to service_role;

-- `v_today` joins attendance, so it is withheld from the service role as well
-- even though the table list above already covers the underlying rows.
revoke all on public.v_today from service_role;
