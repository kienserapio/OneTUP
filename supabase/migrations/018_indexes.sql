-- 018 — Remaining indexes and vector search.
--
-- Every foreign key and every (user_id, date) pair used in a range scan gets an
-- index. The vector indexes are created here rather than alongside their tables
-- because ivfflat wants to be built against data — on an empty table it is
-- created now and reindexed once the corpus is seeded.

-- Foreign keys that are filtered on but were not indexed at creation.
create index if not exists idx_grades_user on public.grades (user_id);
create index if not exists idx_components_user on public.grade_components (user_id);
create index if not exists idx_subtasks_user on public.deadline_subtasks (user_id);
create index if not exists idx_flashcards_pack on public.flashcards (pack_id);
create index if not exists idx_reviews_card on public.flashcard_reviews (flashcard_id, reviewed_at desc);
create index if not exists idx_eval_answers_user on public.evaluation_answers (user_id);
create index if not exists idx_announcement_confirmations_user
  on public.announcement_confirmations (user_id);
create index if not exists idx_class_reps_user on public.class_reps (user_id);
create index if not exists idx_place_corrections_place on public.place_corrections (place_id);
create index if not exists idx_route_verifications_route on public.route_verifications (route_id);
create index if not exists idx_route_verifications_leg on public.route_verifications (leg_id);
create index if not exists idx_route_legs_leg on public.route_legs (leg_id);

-- Vector search. `lists` is deliberately small for a corpus that starts tiny;
-- rebuild with lists ≈ sqrt(rows) once the knowledge base is seeded.
create index if not exists idx_kb_embedding on public.knowledge_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 10);

create index if not exists idx_chunks_embedding on public.study_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 10);

-- Text search over announcements, for the in-app search field.
create index if not exists idx_announcements_search on public.announcements
  using gin (to_tsvector('simple', coalesce(summary, '') || ' ' || coalesce(detail, '')));

-- Room lookup on the public campus page hits this on every keystroke.
create index if not exists idx_places_name_trgm on public.campus_places (lower(name));
