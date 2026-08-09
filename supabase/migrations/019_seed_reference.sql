-- 019 — Reference seed.
--
-- Honesty note: every commute leg and campus place below is seeded from public
-- route information, not from a student who rode it. `last_verified_at` is left
-- null, so all of it reads as "never confirmed by a student" until someone
-- taps confirm. That is deliberate (PRD §8.5) — seeding with a fake
-- verification date would make the freshness signal worthless on day one.

-- --- Terms ---------------------------------------------------------------

insert into public.terms (code, label, academic_year, ordinal, starts_on, ends_on, is_current)
values
  ('2026-2027-1', '1st Semester AY 2026-2027', '2026-2027', 1, '2026-08-17', '2026-12-19', true),
  ('2025-2026-2', '2nd Semester AY 2025-2026', '2025-2026', 2, '2026-01-19', '2026-05-29', false),
  ('2025-2026-3', 'Summer AY 2025-2026',       '2025-2026', 3, '2026-06-08', '2026-07-24', false)
on conflict (code) do nothing;


-- --- Fare rules ----------------------------------------------------------

insert into public.fare_rules (code, label, discount_pct, rounding, notes)
values
  ('puv_student_20', 'Public utility vehicle, 20% student discount', 20, 'up_quarter',
   'Statutory discount for students in uniform or with a valid ID. Applies to jeepney, bus, UV Express.'),
  ('rail_matrix', 'Rail, station-to-station matrix', null, 'none',
   'LRT and MRT fares are per origin-destination pair. Student discount is 20% on the single-journey fare.'),
  ('flat', 'Flat fare, no student discount', null, 'none',
   'Tricycles and short hops with a fixed price.'),
  ('free', 'No fare', null, 'none', 'Walking legs.')
on conflict (code) do nothing;


-- --- Peak bands ----------------------------------------------------------

insert into public.peak_bands (corridor, days, start_time, end_time, penalty_minutes, severity)
values
  ('rail',        '{monday,tuesday,wednesday,thursday,friday}', '06:30', '09:00', 20, 'heavy'),
  ('rail',        '{monday,tuesday,wednesday,thursday,friday}', '17:00', '19:30', 20, 'heavy'),
  ('edsa_bus',    '{monday,tuesday,wednesday,thursday,friday}', '06:00', '09:30', 30, 'heavy'),
  ('edsa_bus',    '{monday,tuesday,wednesday,thursday,friday}', '16:30', '20:00', 30, 'heavy'),
  ('city_roads',  '{monday,tuesday,wednesday,thursday,friday}', '07:00', '09:00', 10, 'moderate'),
  ('city_roads',  '{monday,tuesday,wednesday,thursday,friday}', '17:00', '19:00', 10, 'moderate'),
  ('cavitex',     '{monday,tuesday,wednesday,thursday,friday}', '05:30', '09:00', 25, 'heavy'),
  ('slex',        '{monday,tuesday,wednesday,thursday,friday}', '05:30', '09:00', 30, 'heavy'),
  ('nlex',        '{monday,tuesday,wednesday,thursday,friday}', '05:30', '09:00', 25, 'heavy')
on conflict do nothing;


-- --- Hubs ----------------------------------------------------------------
-- TUP Manila sits on Ayala Boulevard in Ermita, between the LRT-1 corridor and
-- the Lawton bus terminals, which is why those two are the spine of nearly
-- every route below.

insert into public.commute_hubs (name, kind, lat, lng) values
  ('TUP Manila — Ayala Blvd Gate',      'campus_gate',  14.58760, 120.98470),
  ('TUP Manila — San Marcelino Gate',   'campus_gate',  14.58690, 120.98380),
  ('LRT-1 Central Terminal',            'rail_station', 14.59340, 120.98140),
  ('LRT-1 United Nations',              'rail_station', 14.58220, 120.98460),
  ('LRT-1 Monumento',                   'rail_station', 14.65440, 120.98380),
  ('LRT-1 Baclaran',                    'rail_station', 14.53340, 120.99630),
  ('LRT-1 EDSA',                        'rail_station', 14.53870, 120.99760),
  ('LRT-2 Recto',                       'rail_station', 14.60330, 120.98290),
  ('LRT-2 Araneta Center-Cubao',        'rail_station', 14.61970, 121.05300),
  ('LRT-2 Antipolo',                    'rail_station', 14.62360, 121.13000),
  ('MRT-3 Taft Avenue',                 'rail_station', 14.53780, 121.00140),
  ('MRT-3 North Avenue',                'rail_station', 14.65200, 121.03230),
  ('Lawton / Liwasang Bonifacio',       'terminal',     14.59450, 120.98000),
  ('Quiapo — Plaza Miranda',            'landmark',     14.59830, 120.98360),
  ('Grace Park, Caloocan',              'landmark',     14.64700, 120.98200),
  ('Alabang Starmall Terminal',         'terminal',     14.41970, 121.04100),
  ('Baclaran Terminal',                 'terminal',     14.53200, 120.99800),
  ('Cubao Terminal',                    'terminal',     14.62000, 121.05400),
  ('Fairview Terminal',                 'terminal',     14.73000, 121.06000),
  ('Bacoor Terminal',                   'terminal',     14.45900, 120.94500),
  ('Cainta Junction',                   'landmark',     14.57900, 121.11600),
  ('Meycauayan Terminal',               'terminal',     14.73400, 120.95600)
on conflict (name) do nothing;


-- --- Origin areas --------------------------------------------------------

insert into public.commute_areas (name, city, lat, lng) values
  ('Grace Park / Monumento',   'Caloocan',    14.65000, 120.98300),
  ('Sampaloc / España',        'Manila',      14.61000, 120.99400),
  ('Tondo',                    'Manila',      14.61500, 120.96700),
  ('Cubao',                    'Quezon City', 14.62000, 121.05300),
  ('Fairview / Novaliches',    'Quezon City', 14.73000, 121.06000),
  ('Alabang',                  'Muntinlupa',  14.42000, 121.04100),
  ('Bacoor / Imus',            'Cavite',      14.45900, 120.94500),
  ('Cainta / Antipolo',        'Rizal',       14.58000, 121.11600),
  ('Meycauayan / Marilao',     'Bulacan',     14.73400, 120.95600),
  ('Parañaque / Baclaran',     'Parañaque',   14.53200, 120.99800)
on conflict (name) do nothing;


-- --- Legs ----------------------------------------------------------------
-- Legs are shared: the "LRT-1 Monumento to Central Terminal" row below serves
-- every route that uses it, so a fare change is one edit.

with hub as (select name, id from public.commute_hubs)
insert into public.commute_legs
  (mode, corridor, from_hub_id, to_hub_id, from_label, to_label,
   base_fare, fare_rule_code, duration_minutes, peak_penalty_minutes, notes)
select v.mode::public.transport_mode, v.corridor,
       f.id, t.id, v.from_label, v.to_label,
       v.base_fare, v.rule, v.minutes, v.peak, v.notes
from (values
  -- The last mile. Every inbound route ends with one of these.
  ('walk', 'walk', 'LRT-1 Central Terminal', 'TUP Manila — Ayala Blvd Gate',
   0, 'free', 8, 0, 'Straight down Ayala Boulevard. Covered for most of it.'),
  ('walk', 'walk', 'LRT-1 United Nations', 'TUP Manila — San Marcelino Gate',
   0, 'free', 10, 0, 'Along San Marcelino. Floods in heavy rain.'),
  ('walk', 'walk', 'Lawton / Liwasang Bonifacio', 'TUP Manila — Ayala Blvd Gate',
   0, 'free', 12, 0, 'Past the post office, along Ayala Boulevard.'),
  ('jeep', 'city_roads', 'Quiapo — Plaza Miranda', 'TUP Manila — Ayala Blvd Gate',
   13, 'puv_student_20', 12, 10, 'Any jeep signed for Taft or Baclaran passes TUP.'),

  -- LRT-1, the spine for anyone from the north or the south.
  ('rail', 'rail', 'LRT-1 Monumento', 'LRT-1 Central Terminal',
   25, 'rail_matrix', 22, 20, 'Southbound. Queues at Monumento are long before 8 AM.'),
  ('rail', 'rail', 'LRT-1 Baclaran', 'LRT-1 Central Terminal',
   30, 'rail_matrix', 28, 20, 'Northbound.'),
  ('rail', 'rail', 'LRT-1 EDSA', 'LRT-1 Central Terminal',
   30, 'rail_matrix', 26, 20, 'Northbound, from the MRT-3 interchange.'),

  -- LRT-2, for the east.
  ('rail', 'rail', 'LRT-2 Antipolo', 'LRT-2 Recto',
   35, 'rail_matrix', 40, 20, 'Westbound, end to end.'),
  ('rail', 'rail', 'LRT-2 Araneta Center-Cubao', 'LRT-2 Recto',
   20, 'rail_matrix', 22, 20, 'Westbound.'),
  ('jeep', 'city_roads', 'LRT-2 Recto', 'TUP Manila — Ayala Blvd Gate',
   13, 'puv_student_20', 18, 10, 'Recto to Taft jeep, alight at Ayala Boulevard.'),

  -- Feeder legs into the rail network.
  ('jeep', 'city_roads', 'Grace Park, Caloocan', 'LRT-1 Monumento',
   13, 'puv_student_20', 12, 10, 'Short hop along Rizal Avenue Extension.'),
  ('jeep', 'city_roads', 'Cainta Junction', 'LRT-2 Araneta Center-Cubao',
   20, 'puv_student_20', 35, 10, 'Along Marcos Highway. Slow in the morning.'),
  ('bus', 'edsa_bus', 'Cubao Terminal', 'Lawton / Liwasang Bonifacio',
   25, 'puv_student_20', 55, 30, 'Via España. Cheaper than rail, considerably slower.'),
  ('bus', 'edsa_bus', 'Fairview Terminal', 'Lawton / Liwasang Bonifacio',
   45, 'puv_student_20', 90, 30, 'Via Commonwealth and España.'),
  ('bus', 'nlex', 'Meycauayan Terminal', 'LRT-1 Monumento',
   60, 'puv_student_20', 50, 25, 'NLEX provincial bus, alight at Monumento.'),
  ('uv_express', 'cavitex', 'Bacoor Terminal', 'Lawton / Liwasang Bonifacio',
   70, 'puv_student_20', 60, 25, 'Via CAVITEX. Fills up early; queue before 5:30 AM.'),
  ('bus', 'slex', 'Alabang Starmall Terminal', 'LRT-1 EDSA',
   60, 'puv_student_20', 55, 30, 'Via SLEX and EDSA to the Taft interchange.'),
  ('jeep', 'city_roads', 'Sampaloc / España', 'TUP Manila — Ayala Blvd Gate',
   13, 'puv_student_20', 25, 10, 'España to Quiapo, then any Taft-bound jeep.'),
  ('jeep', 'city_roads', 'Tondo', 'Lawton / Liwasang Bonifacio',
   13, 'puv_student_20', 25, 10, 'Divisoria route, alight at Lawton.'),
  ('jeep', 'city_roads', 'Baclaran Terminal', 'LRT-1 Baclaran',
   0, 'free', 5, 0, 'Walk across to the station concourse.')
) as v(mode, corridor, from_label, to_label, base_fare, rule, minutes, peak, notes)
left join hub f on f.name = v.from_label
left join hub t on t.name = v.to_label
where not exists (
  select 1 from public.commute_legs l
  where l.from_label = v.from_label and l.to_label = v.to_label and l.mode = v.mode::public.transport_mode
);


-- --- Routes --------------------------------------------------------------
-- Each area gets at least one inbound route. Ordinals are the ride order.

do $$
declare
  spec record;
  route uuid;
  leg   uuid;
  step  smallint;
  pair  text[];
begin
  for spec in
    select * from (values
      ('Grace Park / Monumento', 'Jeep to Monumento, LRT-1 to Central',
       array[array['Grace Park, Caloocan','LRT-1 Monumento'],
             array['LRT-1 Monumento','LRT-1 Central Terminal'],
             array['LRT-1 Central Terminal','TUP Manila — Ayala Blvd Gate']]),

      ('Sampaloc / España', 'Straight jeep down España',
       array[array['Sampaloc / España','TUP Manila — Ayala Blvd Gate']]),

      ('Tondo', 'Jeep to Lawton, then walk',
       array[array['Tondo','Lawton / Liwasang Bonifacio'],
             array['Lawton / Liwasang Bonifacio','TUP Manila — Ayala Blvd Gate']]),

      ('Cubao', 'LRT-2 to Recto, jeep to Ayala',
       array[array['LRT-2 Araneta Center-Cubao','LRT-2 Recto'],
             array['LRT-2 Recto','TUP Manila — Ayala Blvd Gate']]),

      ('Cubao', 'Bus via España to Lawton',
       array[array['Cubao Terminal','Lawton / Liwasang Bonifacio'],
             array['Lawton / Liwasang Bonifacio','TUP Manila — Ayala Blvd Gate']]),

      ('Fairview / Novaliches', 'Bus to Lawton, then walk',
       array[array['Fairview Terminal','Lawton / Liwasang Bonifacio'],
             array['Lawton / Liwasang Bonifacio','TUP Manila — Ayala Blvd Gate']]),

      ('Alabang', 'Bus to EDSA, LRT-1 north to Central',
       array[array['Alabang Starmall Terminal','LRT-1 EDSA'],
             array['LRT-1 EDSA','LRT-1 Central Terminal'],
             array['LRT-1 Central Terminal','TUP Manila — Ayala Blvd Gate']]),

      ('Bacoor / Imus', 'UV Express via CAVITEX to Lawton',
       array[array['Bacoor Terminal','Lawton / Liwasang Bonifacio'],
             array['Lawton / Liwasang Bonifacio','TUP Manila — Ayala Blvd Gate']]),

      ('Cainta / Antipolo', 'Jeep to Cubao, LRT-2 to Recto',
       array[array['Cainta Junction','LRT-2 Araneta Center-Cubao'],
             array['LRT-2 Araneta Center-Cubao','LRT-2 Recto'],
             array['LRT-2 Recto','TUP Manila — Ayala Blvd Gate']]),

      ('Meycauayan / Marilao', 'Provincial bus to Monumento, LRT-1 south',
       array[array['Meycauayan Terminal','LRT-1 Monumento'],
             array['LRT-1 Monumento','LRT-1 Central Terminal'],
             array['LRT-1 Central Terminal','TUP Manila — Ayala Blvd Gate']]),

      ('Parañaque / Baclaran', 'LRT-1 north from Baclaran',
       array[array['Baclaran Terminal','LRT-1 Baclaran'],
             array['LRT-1 Baclaran','LRT-1 Central Terminal'],
             array['LRT-1 Central Terminal','TUP Manila — Ayala Blvd Gate']])
    ) as t(area_name, label, legs)
  loop
    if exists (
      select 1 from public.commute_routes r
      join public.commute_areas a on a.id = r.area_id
      where a.name = spec.area_name and r.label = spec.label
    ) then
      continue;
    end if;

    insert into public.commute_routes (area_id, label, direction, status)
    select a.id, spec.label, 'inbound', 'approved'
    from public.commute_areas a where a.name = spec.area_name
    returning id into route;

    if route is null then continue; end if;

    step := 1;
    foreach pair slice 1 in array spec.legs loop
      select id into leg from public.commute_legs
      where from_label = pair[1] and to_label = pair[2]
      limit 1;

      if leg is not null then
        insert into public.route_legs (route_id, leg_id, ordinal)
        values (route, leg, step)
        on conflict do nothing;
        step := step + 1;
      end if;
    end loop;
  end loop;
end $$;


-- --- Campus places -------------------------------------------------------
-- Buildings and gates only. Printing prices, canteen hours and study spots are
-- left for students to contribute — seeding a price we have not checked would
-- be exactly the thing PRD §8.5 exists to prevent.

insert into public.campus_places
  (campus, category, name, description, lat, lng, building_code, is_emergency, status)
values
  ('manila', 'gate',     'Ayala Boulevard Gate',
   'The main gate. Nearest to LRT-1 Central Terminal — about an eight-minute walk.',
   14.58760, 120.98470, null, false, 'approved'),
  ('manila', 'gate',     'San Marcelino Gate',
   'Nearest to LRT-1 United Nations and the jeepney stops on San Marcelino.',
   14.58690, 120.98380, null, false, 'approved'),
  ('manila', 'building', 'Main Building',
   'Administration, Registrar, and the Office of Student Affairs.',
   14.58790, 120.98430, 'MAIN', false, 'approved'),
  ('manila', 'building', 'College of Engineering',
   null, 14.58830, 120.98500, 'COE', false, 'approved'),
  ('manila', 'building', 'College of Science',
   null, 14.58810, 120.98380, 'COS', false, 'approved'),
  ('manila', 'building', 'College of Industrial Technology',
   null, 14.58720, 120.98530, 'CIT', false, 'approved'),
  ('manila', 'building', 'College of Industrial Education',
   null, 14.58750, 120.98330, 'CIE', false, 'approved'),
  ('manila', 'building', 'College of Architecture and Fine Arts',
   null, 14.58700, 120.98450, 'CAFA', false, 'approved'),
  ('manila', 'building', 'University Library',
   null, 14.58780, 120.98490, 'LIB', false, 'approved'),
  ('manila', 'building', 'Gymnasium',
   null, 14.58680, 120.98500, 'GYM', false, 'approved'),
  ('manila', 'service',  'University Clinic',
   'First aid and medical certificates.',
   14.58800, 120.98410, null, true, 'approved'),
  ('manila', 'service',  'Registrar',
   'Transcripts, enrolment records, certifications.',
   14.58790, 120.98430, 'MAIN', false, 'approved'),
  ('manila', 'landmark', 'The Oval',
   'The open field at the centre of campus. Where most orgs gather.',
   14.58740, 120.98460, null, false, 'approved')
on conflict do nothing;


-- --- Evaluation instrument placeholder -----------------------------------
-- The real instrument's question count and wording is PRD open question Q3.
-- This placeholder exists so M8 can be built and tested; it is replaced, not
-- extended, once the actual form is confirmed.

insert into public.evaluation_instruments (version, questions, is_active)
select '0.1.0-placeholder', '[]'::jsonb, false
where not exists (select 1 from public.evaluation_instruments);
