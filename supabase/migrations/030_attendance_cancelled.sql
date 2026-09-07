-- 030 — A class that did not happen.
--
-- Suspensions are routine here: a typhoon signal, a flood warning, a city-wide
-- holiday, a faculty member who never arrived. Until now a student had three
-- bad options for those days — leave the meeting unrecorded and wonder later
-- whether they forgot, mark themselves present at a class nobody held, or mark
-- excused, which reads as "I was away" rather than "there was nothing to
-- attend".
--
-- `cancelled` is none of those. Like `excused` it is excluded from every count,
-- but it says something different and truer: the meeting itself was called off.
-- That distinction matters when a student is reconstructing a term two months
-- later and trying to work out where their cuts actually went.

alter type public.attendance_status add value if not exists 'cancelled';

comment on type public.attendance_status is
  'excused is student-declared and excluded from every count, so an approved '
  'absence never inflates a cut total. cancelled means the class meeting did '
  'not take place at all — a suspension, or a faculty absence — and is '
  'likewise excluded, but records that there was nothing to attend rather '
  'than that the student was away.';
