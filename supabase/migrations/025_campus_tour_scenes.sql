-- 025 — Virtual tour scenes, and the places they open on.
--
-- The tour is TUPniverse's (github.com/smnthegr/TUPniverse), hosted on Panoee.
-- OneTUP embeds it and links each building to the scene that shows it, so
-- "where is the Registrar" can end in actually looking at the Registrar.
--
-- The repository carries no licence, so this is used with the author's
-- permission or not at all — PRD Q5. Everything here is inert until
-- NEXT_PUBLIC_CAMPUS_TOUR_URL is set, and the interface credits TUPniverse
-- wherever a scene appears.

-- Places the seed did not have but the tour does. Adding them is what makes the
-- tour useful rather than decorative: a student looking for the Cashier can now
-- find it on the map and then see it.
insert into public.campus_places
  (campus, category, name, description, lat, lng, building_code, is_emergency, status)
values
  ('manila', 'service', 'Registrar', 'Transcripts, enrolment records, certifications.',
   14.58775, 120.98445, 'MAIN', false, 'approved'),
  ('manila', 'service', 'Cashier', 'Tuition and fees.',
   14.58782, 120.98425, 'MAIN', false, 'approved'),
  ('manila', 'service', 'Office of Admissions', null,
   14.58785, 120.98435, 'MAIN', false, 'approved'),
  ('manila', 'service', 'Office of Student Affairs', 'OSA — student orgs, scholarships, conduct.',
   14.58788, 120.98440, 'MAIN', false, 'approved'),
  ('manila', 'service', 'Guidance and Testing Office', null,
   14.58790, 120.98432, 'MAIN', false, 'approved'),
  ('manila', 'food', 'Canteen', null,
   14.58730, 120.98480, null, false, 'approved'),
  ('manila', 'building', 'Covered Court', 'Assemblies, PE classes, and the bigger org events.',
   14.58690, 120.98505, null, false, 'approved'),
  ('manila', 'building', 'IRTC Building', 'Integrated Research and Training Center.',
   14.58810, 120.98520, 'IRTC', false, 'approved'),
  ('manila', 'gate', 'Gate 1', null, 14.58840, 120.98400, null, false, 'approved'),
  ('manila', 'gate', 'Gate 3', null, 14.58700, 120.98540, null, false, 'approved'),
  ('manila', 'gate', 'Gate 4', null, 14.58660, 120.98420, null, false, 'approved')
on conflict do nothing;

-- Scene links. `tour_scene_url` already existed on the table; this fills it.
do $$
declare
  mapping jsonb := jsonb_build_object(
    'Ayala Boulevard Gate',                 '692f8fa43b0c0b0405f9159b',  -- Main Entrance Gate 2
    'Gate 1',                               '693078140b58ae14d43f00f4',
    'Gate 3',                               '692fc1249ddbb53b9aeb9ad3',
    'Gate 4',                               '692fbf96b2765f54f84152e2',
    'Main Building',                        '6930733c557de6dc29c27be9',  -- Administration Bldg.
    'Registrar',                            '692fbd3b9ddbb5ae94eb9a81',
    'Cashier',                              '6930747e0b58ae6cd63f006e',
    'Office of Admissions',                 '692f9b633b0c0ba6f7f91624',
    'Office of Student Affairs',            '692f9cfc405625049f12e7d3',  -- OSA & IRJP
    'Guidance and Testing Office',          '692f9e48405625feb612e803',
    'University Clinic',                    '692fa1409ddbb57da5eb987f',  -- Clinic & TUP Museum
    'University Library',                   '692fbf479ddbb5354deb9aa4',
    'College of Science',                   '693079f6f5844948b0e5e848',  -- COS Bldg
    'College of Engineering',               '69306f99ad415ef19a09748e',  -- COE bldg
    'College of Industrial Technology',     '692fc5c69ddbb5579ceb9b13',  -- CIT Entrance
    'College of Industrial Education',      '692fbd8e3b0c0bbf4af91883',  -- CIE Entrance
    'College of Architecture and Fine Arts','69318c8bfda6af3723a53663',  -- CAFA Entrance
    'IRTC Building',                        '69306cdfad415eae7f09743e',
    'Covered Court',                        '692fcbc29ddbb5692deb9b2d',
    'Canteen',                              '693083e7cc94a64f91610028',
    'The Oval',                             '692fcffab2765fef784153b6'   -- TUP Centennial Grounds
  );
  place text;
begin
  for place in select jsonb_object_keys(mapping)
  loop
    update public.campus_places
    -- The scene id alone, not a full URL: the tour's base is configuration, so
    -- a move to another host is an environment edit rather than a migration.
    set tour_scene_url = mapping ->> place
    where name = place and campus = 'manila';
  end loop;
end $$;

comment on column public.campus_places.tour_scene_url is
  'Panoee scene id for the TUPniverse virtual tour. Joined to the tour base URL '
  'at render time, so changing host is a config edit.';
