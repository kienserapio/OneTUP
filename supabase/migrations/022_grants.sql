-- 022 — Table privileges.
--
-- RLS decides which *rows* a request may see. Grants decide whether the role
-- may touch the table at all, and the two are independent: a table with perfect
-- policies and no grant returns "permission denied", which is what the campus
-- map hit on its first anonymous load.
--
-- These are written explicitly rather than as `grant all on all tables`, so
-- adding a table is a deliberate decision about who reaches it rather than an
-- automatic one.

grant usage on schema public to anon, authenticated;

-- --- Anonymous ------------------------------------------------------------
-- Non-personal reference data only. `campus_places` is the one user-facing
-- table on this list, and serving it without an account is a product
-- requirement (ADR-012), not an oversight.

grant select on
  public.terms,
  public.courses,
  public.sections,
  public.campus_places,
  public.commute_areas,
  public.commute_hubs,
  public.commute_legs,
  public.commute_routes,
  public.route_legs,
  public.fare_rules,
  public.peak_bands,
  public.knowledge_documents,
  public.knowledge_chunks,
  public.evaluation_instruments
to anon;

-- --- Authenticated --------------------------------------------------------
-- Read access to everything a student's own policies could return. RLS narrows
-- each of these to `auth.uid()`'s own rows; the grant only opens the door.

grant select on
  public.terms,
  public.courses,
  public.sections,
  public.campus_places,
  public.commute_areas,
  public.commute_hubs,
  public.commute_legs,
  public.commute_routes,
  public.route_legs,
  public.fare_rules,
  public.peak_bands,
  public.knowledge_documents,
  public.knowledge_chunks,
  public.evaluation_instruments,
  public.profiles,
  public.user_preferences,
  public.user_thresholds,
  public.enrollments,
  public.schedule_blocks,
  public.schedule_rejections,
  public.attendance_records,
  public.grades,
  public.grade_components,
  public.grade_scale_mappings,
  public.deadlines,
  public.deadline_subtasks,
  public.scheduled_notifications,
  public.departure_plans,
  public.announcements,
  public.announcement_confirmations,
  public.announcement_submissions,
  public.class_reps,
  public.groups,
  public.group_members,
  public.study_packs,
  public.study_chunks,
  public.flashcards,
  public.flashcard_reviews,
  public.practice_questions,
  public.study_sessions,
  public.evaluations,
  public.evaluation_answers,
  public.route_verifications,
  public.place_corrections,
  public.sync_jobs,
  public.ai_runs,
  public.audit_log,
  public.notification_subscriptions
to authenticated;

-- Writes, on the tables a student legitimately owns or contributes to.
grant insert, update, delete on
  public.profiles,
  public.user_preferences,
  public.user_thresholds,
  public.enrollments,
  public.schedule_blocks,
  public.schedule_rejections,
  public.attendance_records,
  public.grades,
  public.grade_components,
  public.grade_scale_mappings,
  public.deadlines,
  public.deadline_subtasks,
  public.scheduled_notifications,
  public.departure_plans,
  public.announcement_confirmations,
  public.announcement_submissions,
  public.groups,
  public.group_members,
  public.study_packs,
  public.study_chunks,
  public.flashcards,
  public.flashcard_reviews,
  public.practice_questions,
  public.study_sessions,
  public.evaluations,
  public.evaluation_answers,
  public.notification_subscriptions
to authenticated;

-- Insert-only, because the shared catalog and the community contribution
-- queues must not be editable by whoever happens to have added a row to them.
grant insert on
  public.courses,
  public.sections,
  public.announcements,
  public.class_reps,
  public.campus_places,
  public.commute_legs,
  public.commute_routes,
  public.route_legs,
  public.route_verifications,
  public.place_corrections,
  public.moderation_queue
to authenticated;

-- A submitter may correct their own announcement, and their own pending leg,
-- while those policies still restrict it to rows they submitted.
grant update on public.announcements, public.commute_legs to authenticated;

-- Views inherit nothing; they need their own grant. All of them run
-- `security_invoker`, so the caller's RLS still applies underneath.
grant select on
  public.v_today,
  public.v_gwa,
  public.v_attendance_summary,
  public.v_deadlines_upcoming,
  public.v_route_summary
to authenticated;

grant select on public.v_route_summary to anon;

grant execute on function public.commit_schedule(text, text, uuid, jsonb) to authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, int, float, text)
  to anon, authenticated;

-- `ai_cache`, `rate_limit_events` and `schema_migrations` are deliberately
-- absent: they are service-role only, and no client has any business reaching
-- them even with a policy that would return nothing.
