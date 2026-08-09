-- 021 — Transactional schedule commit.
--
-- The commit touches three tables and must land whole: a student left with
-- enrollments but no blocks, or blocks pointing at a course that was not
-- created, is worse than a failed import they can retry.
--
-- It runs `security invoker`, so every write is still subject to the caller's
-- RLS. The function exists for atomicity, not to escalate privilege.

create or replace function public.commit_schedule(
  p_term_code text,
  p_source    text,
  p_job_id    uuid,
  p_courses   jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id       uuid := (select auth.uid());
  v_term_id       uuid;
  v_course        jsonb;
  v_meeting       jsonb;
  v_course_id     uuid;
  v_enrollment_id uuid;
  v_color         smallint := 0;
  v_enrollments   uuid[] := '{}';
  v_blocks        uuid[] := '{}';
  v_block_id      uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id into v_term_id from public.terms where code = p_term_code;
  if v_term_id is null then
    raise exception 'unknown term %', p_term_code using errcode = '22023';
  end if;

  -- Idempotent on job_id: a retried commit after a dropped connection must not
  -- produce a second copy of the student's schedule.
  if p_job_id is not null and exists (
    select 1 from public.enrollments
    where user_id = v_user_id and term_id = v_term_id and imported_at is not null
      and source = p_source
      and created_at > now() - interval '10 minutes'
  ) then
    select coalesce(array_agg(id), '{}') into v_enrollments
    from public.enrollments where user_id = v_user_id and term_id = v_term_id;

    return jsonb_build_object(
      'already_committed', true,
      'enrollment_ids', to_jsonb(v_enrollments)
    );
  end if;

  for v_course in select * from jsonb_array_elements(p_courses)
  loop
    -- The catalog is shared, so an existing (code, title) is reused rather than
    -- duplicated. Students may insert but never update it.
    select id into v_course_id
    from public.courses
    where code = v_course ->> 'code' and title = v_course ->> 'title';

    if v_course_id is null then
      insert into public.courses (code, title, lec_units, lab_units, units)
      values (
        v_course ->> 'code',
        v_course ->> 'title',
        coalesce((v_course ->> 'lecUnits')::numeric, 0),
        coalesce((v_course ->> 'labUnits')::numeric, 0),
        coalesce((v_course ->> 'units')::numeric, 0)
      )
      returning id into v_course_id;
    end if;

    insert into public.enrollments
      (user_id, course_id, term_id, faculty_name, color_key, source, imported_at)
    values (
      v_user_id, v_course_id, v_term_id,
      nullif(v_course ->> 'faculty', ''),
      v_color,
      p_source,
      now()
    )
    on conflict (user_id, course_id, term_id) do update
      set faculty_name = excluded.faculty_name,
          imported_at  = excluded.imported_at,
          updated_at   = now()
    returning id into v_enrollment_id;

    v_enrollments := v_enrollments || v_enrollment_id;
    v_color := (v_color + 1) % 12;

    -- Re-importing replaces this course's imported blocks. Manual blocks are
    -- never touched: a student's own org meeting is not the portal's to remove.
    delete from public.schedule_blocks
    where user_id = v_user_id
      and enrollment_id = v_enrollment_id
      and source <> 'manual';

    for v_meeting in select * from jsonb_array_elements(v_course -> 'meetings')
    loop
      insert into public.schedule_blocks
        (user_id, enrollment_id, day, start_time, end_time, room, source, raw_schedule, parse_status)
      values (
        v_user_id,
        v_enrollment_id,
        (v_meeting ->> 'day')::public.weekday,
        (v_meeting ->> 'startTime')::time,
        (v_meeting ->> 'endTime')::time,
        nullif(v_meeting ->> 'room', ''),
        p_source,
        nullif(v_course ->> 'rawSchedule', ''),
        coalesce(v_meeting ->> 'parseStatus', 'ok')
      )
      returning id into v_block_id;

      v_blocks := v_blocks || v_block_id;
    end loop;
  end loop;

  return jsonb_build_object(
    'already_committed', false,
    'enrollment_ids', to_jsonb(v_enrollments),
    'block_ids', to_jsonb(v_blocks)
  );
end $$;

comment on function public.commit_schedule is
  'Atomically upserts courses, enrollments and schedule blocks for a reviewed import.';
