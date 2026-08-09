-- 020 — Rail fare matrix.
--
-- LRT-1 and LRT-2 price per origin–destination pair rather than by distance
-- rule, so the discount cannot be derived — it has to be looked up. Without
-- this matrix the fare evaluator falls back to charging the full base fare,
-- which is the safe direction to be wrong in but shows students a figure higher
-- than they will actually pay.
--
-- Still unverified: these are single-journey ticket prices from public fare
-- tables, not from a student who tapped in. They will read as such until
-- someone confirms them.

update public.fare_rules
set matrix = jsonb_build_object(
  'LRT-1 Monumento', jsonb_build_object(
    'LRT-1 Central Terminal', jsonb_build_object('regular', 25, 'student', 20)
  ),
  'LRT-1 Baclaran', jsonb_build_object(
    'LRT-1 Central Terminal', jsonb_build_object('regular', 30, 'student', 24)
  ),
  'LRT-1 EDSA', jsonb_build_object(
    'LRT-1 Central Terminal', jsonb_build_object('regular', 30, 'student', 24)
  ),
  'LRT-2 Antipolo', jsonb_build_object(
    'LRT-2 Recto', jsonb_build_object('regular', 35, 'student', 28)
  ),
  'LRT-2 Araneta Center-Cubao', jsonb_build_object(
    'LRT-2 Recto', jsonb_build_object('regular', 20, 'student', 16)
  )
)
where code = 'rail_matrix';
