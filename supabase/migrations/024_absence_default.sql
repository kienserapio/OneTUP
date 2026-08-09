-- 024 — The real absence limit.
--
-- PRD open question Q1, answered: three absences is an unofficial drop at TUP,
-- and three lates count as one absence. The schema shipped with a placeholder
-- of five, which would have told a student they had two absences in hand at the
-- exact moment they had none — the precise harm the attendance module exists to
-- prevent.
--
-- Existing rows are moved only where they still hold the placeholder, so a
-- student who has already set their own limit keeps it.

alter table public.user_preferences
  alter column default_allowed_absences set default 3;

update public.user_preferences
set default_allowed_absences = 3
where default_allowed_absences = 5;

comment on column public.user_preferences.default_allowed_absences is
  'Three absences is an unofficial drop. The real limit still comes from each '
  'syllabus, so this is a starting point and every enrollment can override it.';
