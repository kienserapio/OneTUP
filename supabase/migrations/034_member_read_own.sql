-- 034 — A student can always see their own membership row.
--
-- 012 gave `group_members` one select policy — `is_group_member(group_id)` —
-- which is right for reading *other* members and wrong for reading yourself at
-- the one moment it matters.
--
-- `insert ... returning` re-checks the new row against the select policies, and
-- `is_group_member` is `stable`, so inside that statement it still sees the
-- snapshot from before the insert: the row being created is not there yet, the
-- check fails, and Postgres reports it as
-- `new row violates row-level security policy for table "group_members"`.
--
-- The practical effect was that creating a classroom failed for its owner
-- whenever the client asked for the inserted row back — which every client
-- does, because it needs the denormalised `term_id` and `display_name` the
-- trigger just filled in.
--
-- Reading your own membership is not a widening of anything: `user_id =
-- auth.uid()` is narrower than the policy beside it.

create policy members_read_own on public.group_members
  for select using (user_id = (select auth.uid()));
