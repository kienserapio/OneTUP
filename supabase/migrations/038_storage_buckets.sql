-- 038 — The two storage buckets, and the policies that keep them private.
--
-- Neither existed. `announcement-images` has been referenced by
-- `app/share/route.ts` since the share target shipped, and every upload through
-- it has been failing — quietly, because that route treats an upload error as
-- "no image" and carries on. A student who shared a screenshot of a quiz
-- announcement got their text ingested and their screenshot dropped, with
-- nothing anywhere saying so.
--
-- `study-sources` is new, for study pack generation: the document a student
-- uploaded is kept so a generated card can be checked against the thing it came
-- from, which is what turns "verify this yourself" from a disclaimer into an
-- action (013's comment, and ADR-007).

-- --- The buckets ----------------------------------------------------------
--
-- Private, both of them. A public bucket means an unguessable URL is the only
-- thing between a stranger and a student's lecture notes, and an unguessable
-- URL is not an access control. Reads go through signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'announcement-images',
    'announcement-images',
    false,
    5 * 1024 * 1024,
    array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
  ),
  (
    'study-sources',
    'study-sources',
    false,
    10 * 1024 * 1024,
    array['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --- Who may touch what ---------------------------------------------------
--
-- Every object lives under a folder named for the owner's user id, and that
-- first path segment is the whole access rule. `storage.foldername(name)` is
-- how Supabase exposes it, and comparing `[1]` to `auth.uid()` is the standard
-- form — it is also the only thing standing between two students' uploads, so
-- it is written out per operation rather than as one `for all` policy where a
-- mistake would be harder to see.

drop policy if exists "own announcement images: read"   on storage.objects;
drop policy if exists "own announcement images: write"  on storage.objects;
drop policy if exists "own announcement images: delete" on storage.objects;
drop policy if exists "own study sources: read"         on storage.objects;
drop policy if exists "own study sources: write"        on storage.objects;
drop policy if exists "own study sources: delete"       on storage.objects;

create policy "own announcement images: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own announcement images: write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own announcement images: delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own study sources: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own study sources: write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own study sources: delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No update policy on either bucket, deliberately. An uploaded file is a record
-- of what was uploaded; replacing its bytes in place would leave every
-- `source_chunk_id` pointing at a document that no longer says what the card
-- was generated from. Deleting and re-uploading is the honest way to change
-- one, and it produces a new path.
