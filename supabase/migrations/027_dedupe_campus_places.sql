-- 025 added places that some of the original seed already contained, so the
-- campus list carried a second Registrar. Two rows with the same tour scene
-- also gave React two children with the same key in the scene picker, which is
-- unsupported and can drop one of them from the list outright.
--
-- The older row wins: anything a student has already corrected points at it.

delete from campus_places outdated
using campus_places kept
where outdated.name = kept.name
  and coalesce(outdated.building_code, '') = coalesce(kept.building_code, '')
  and outdated.created_at > kept.created_at
  and not exists (
    select 1 from place_corrections where place_id = outdated.id
  );

-- A scene is one place. Without this the next seed that runs twice puts the
-- picker back into the same broken state.
create unique index if not exists campus_places_tour_scene_key
  on campus_places (tour_scene_url)
  where tour_scene_url is not null;
