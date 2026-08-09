-- Two legs start from a district rather than from a named terminal, so they
-- carried no hub at all and the map had nothing to place. Both are boarding
-- points a student would recognise; the coordinate is the district's usual
-- boarding stretch, not a doorway, which is why they are landmarks and not
-- terminals. Every other hub in the graph is an exact station or gate.
--
-- Without these the route map for Sampaloc and Tondo drew one endpoint and
-- silently skipped the other half of the trip.

insert into commute_hubs (name, kind, lat, lng)
values
  ('Sampaloc — España Blvd', 'landmark', 14.6093, 120.9926),
  ('Tondo — Divisoria', 'landmark', 14.6013, 120.9702)
on conflict (name) do nothing;

update commute_legs
set from_hub_id = (select id from commute_hubs where name = 'Sampaloc — España Blvd')
where from_label = 'Sampaloc / España'
  and from_hub_id is null;

update commute_legs
set from_hub_id = (select id from commute_hubs where name = 'Tondo — Divisoria')
where from_label = 'Tondo'
  and from_hub_id is null;
