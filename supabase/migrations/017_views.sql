-- 017 — Views.
--
-- Every one of these carries `security_invoker = true`. Without it a view runs
-- with its owner's privileges and silently bypasses RLS — the single most
-- likely way this schema could leak one student's data to another. The CI check
-- in scripts/db.mjs fails the build if any view is ever created without it.

create view public.v_attendance_summary
with (security_invoker = true) as
select
  a.user_id,
  a.enrollment_id,
  count(*) filter (where a.status = 'present') as present_count,
  count(*) filter (where a.status = 'absent')  as absent_count,
  count(*) filter (where a.status = 'late')    as late_count,
  count(*) filter (where a.status = 'excused') as excused_count,
  coalesce(e.allowed_absences, p.default_allowed_absences) as allowed,
  coalesce(e.lates_per_absence, p.lates_per_absence)       as lates_per_absence,
  count(*) filter (where a.status = 'absent')
    + floor(
        count(*) filter (where a.status = 'late')::numeric
        / nullif(coalesce(e.lates_per_absence, p.lates_per_absence), 0)
      ) as absence_units
from public.attendance_records a
join public.enrollments e on e.id = a.enrollment_id
join public.user_preferences p on p.user_id = a.user_id
group by a.user_id, a.enrollment_id, e.allowed_absences,
         p.default_allowed_absences, e.lates_per_absence, p.lates_per_absence;


create view public.v_gwa
with (security_invoker = true) as
select
  e.user_id,
  e.term_id,
  round(sum(g.value * c.units) / nullif(sum(c.units), 0), 4) as gwa,
  sum(c.units)            as graded_units,
  count(*)                as graded_courses,
  bool_or(g.is_projected) as includes_projection
from public.enrollments e
join public.grades  g on g.enrollment_id = e.id
join public.courses c on c.id = e.course_id
where g.value is not null
group by e.user_id, e.term_id;


create view public.v_deadlines_upcoming
with (security_invoker = true) as
select
  d.*,
  c.code  as course_code,
  c.title as course_title,
  extract(epoch from (d.due_at - now())) / 3600 as hours_left,
  case
    when d.due_at < now()                        then 'overdue'
    when d.due_at <= now() + interval '6 hours'  then 'critical'
    when d.due_at <= now() + interval '24 hours' then 'urgent'
    when d.due_at <= now() + interval '72 hours' then 'soon'
    when d.due_at <= now() + interval '7 days'   then 'upcoming'
    else 'later'
  end as urgency
from public.deadlines d
left join public.enrollments e on e.id = d.enrollment_id
left join public.courses     c on c.id = e.course_id
where d.status = 'open'
  and d.due_at <= now() + interval '14 days';


-- Today's blocks, already joined to the course and to whether attendance has
-- been recorded. The Today view is the one screen that must render instantly
-- from cache, so it is one query rather than four.
create view public.v_today
with (security_invoker = true) as
select
  b.id as block_id,
  b.user_id,
  b.enrollment_id,
  coalesce(c.code, b.title)  as label,
  c.title                    as course_title,
  b.day,
  b.start_time,
  b.end_time,
  b.room,
  b.source,
  b.prompt_attendance,
  e.color_key,
  e.faculty_name,
  a.status  as attendance_status,
  a.id      as attendance_id
from public.schedule_blocks b
left join public.enrollments e on e.id = b.enrollment_id
left join public.courses     c on c.id = e.course_id
left join public.attendance_records a
       on a.block_id = b.id
      and a.session_date = (now() at time zone 'Asia/Manila')::date
where b.day = lower(to_char(now() at time zone 'Asia/Manila', 'FMday'))::public.weekday;


-- Route totals with student fares resolved. The discount is applied here, at
-- read time, from the rule — never stored as a second fare figure (ADR-011).
create view public.v_route_summary
with (security_invoker = true) as
select
  r.id as route_id,
  r.area_id,
  r.direction,
  r.label,
  r.status,
  r.verified_count,
  r.last_verified_at,
  count(*) filter (where l.mode <> 'walk') as transfers,
  sum(l.duration_minutes)                  as base_minutes,
  sum(
    case fr.code
      when 'free' then 0
      else round(l.base_fare, 2)
    end
  ) as fare_regular,
  sum(
    case fr.code
      when 'free'  then 0
      when 'flat'  then round(l.base_fare, 2)
      when 'rail_matrix' then coalesce(
        (fr.matrix -> l.from_label -> l.to_label ->> 'student')::numeric,
        round(l.base_fare, 2)
      )
      else round(l.base_fare * (1 - coalesce(fr.discount_pct, 20) / 100.0), 2)
    end
  ) as fare_student,
  case
    when r.last_verified_at is null then 'unverified'
    when r.last_verified_at > now() - interval '30 days' then 'fresh'
    when r.last_verified_at > now() - interval '90 days' then 'aging'
    else 'stale'
  end as freshness
from public.commute_routes r
join public.route_legs    rl on rl.route_id = r.id
join public.commute_legs  l  on l.id = rl.leg_id
left join public.fare_rules fr on fr.code = l.fare_rule_code
group by r.id;
