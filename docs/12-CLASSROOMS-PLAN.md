# OneTUP — Classrooms and the shared tracker

**Status:** built through Phase 4 (§14). Push notifications are deferred by
design (§13), and term rollover (Phase 6) is not built.
**Date:** August 2026, built August 2026
**Depends on:** [04-DATA-MODEL.md](04-DATA-MODEL.md), [02-ARD.md](02-ARD.md), [03-TDD-APP-MODULE.md](03-TDD-APP-MODULE.md), [09-IMPLEMENTATION-PLAN.md](09-IMPLEMENTATION-PLAN.md)

Every decision this feature needs is made here. §14 is the build order, and each
phase in it is a checklist of files, not a description.

What shipped differs from this plan in five places, each recorded where it
happens: `034` (a member must be able to read back their own membership row),
`035` (a SQL-function parameter shadowed by a column of the same name), `033`
(leaving had to take a student's submission marks with it — no foreign key did
that on its own; and promote/remove/hand-over needed definer functions of their
own), `parseSectionParts` (the campus-less section labels already in
`profiles`), and `groups` joining the offline set so the section badge survives
with no signal.

---

## 1. What is being built

> A classroom for a block section — `BSCS-4B-M`. A class representative invites
> classmates in. When anyone in the class posts an announcement, it appears in
> every member's tracker. A post can carry a submission log, so the class can
> see who has already turned the work in.

That is the whole feature: the existing `groups` concept with a section identity
bolted on, one shared post table, and one per-member state row.

**What it is not**, stated up front because the schema will be tempting:

- **Not an access-control system.** No permission tier, no moderator queue, no
  faculty account, no admin. `rep` exists for exactly four abilities — approve
  joins, remove a member, hide a post, rotate the invite code — and nothing else
  in the product consults it.
- **Not a gradebook or an attendance sheet.** No rep, and no member, ever sees
  another student's attendance, grades, or cut count. No policy here grants it,
  and none should be added later. §9.
- **Not a chat.** Posts are announcements that become tasks. No replies, no
  threads, no reactions.
- **Not a directory.** Membership is visible inside a classroom and nowhere
  else.

| # | Capability | Where |
|---|---|---|
| A | A classroom keyed to a block section, joined by invite code | §4, §5 |
| B | The rep, and how the app knows who it is | §6 |
| C | A post that lands in every member's tracker | §7 |
| D | A submission log on posts that ask for one | §8 |
| E | The screens, in the product's own design language | §11 |
| F | Push when something is posted | Deferred — §13 |

---

## 2. What already exists

The honest answer to "is this possible" is that most of the plumbing is already
in the database, unused.

| Already there | Where | Note |
|---|---|---|
| `groups`, `group_members`, invite codes | `012_groups.sql` | Membership, roles, `is_group_member()` security-definer helper. No screen uses it. |
| `deadlines.group_id` | `007`, FK added in `012` | A deadline can already belong to a group. Nothing writes it. |
| `deadlines.source = 'group'` | `007` | The source enum already anticipated this exact feature. |
| Announcement intake and extraction | `/api/announcements/ingest`, `announcement_submissions` | Paste or share-sheet in, structured proposal out, deduplicated by `content_hash`, validated against the submitter's real enrollments. |
| The review screen | `components/announcements/share-intake.tsx` | Where the "also post to my classroom" control goes. |
| `contentHash`, `findDuplicate` | `@onetup/core` (`text/simhash`) | Reused unchanged for post dedupe. |
| API conventions | `lib/api/handler.ts`, `errors.ts`, `rate-limit.ts` | `authenticated()`, typed `errors.*`, `enforceLimit()`, structured JSON logs. |
| Offline-first sync | `lib/offline/db.ts`, `lib/offline/sync.ts` | Pull specs per entity, optimistic queued writes, per-field last-write-wins. |
| Design system | `src/design/tokens.css`, `materials.css`, `typography.css`, `components/ui/*` | Everything in §11 is assembled from these. No new primitive is needed. |
| Web Push, end to end | `public/sw.js`, `notification_subscriptions`, `/api/notifications/dispatch` | Built and unused, because nothing calls dispatch on a schedule. §13. |

| Not there | Consequence |
|---|---|
| Any notion of a **block section** as a cohort | §4 — the one genuinely new concept. |
| A join-request and approval flow | §5, §6. |
| Anything that fans a post out to a group | §7. |
| Any per-student state visible to another student | §8, and the boundary in §9. |
| A member's display name readable by another member | §8 — `profiles` is own-row-only under RLS, and stays that way. |
| A classroom icon | §11.4 — one new wrapper in `ui/icon.tsx`. |

---

## 3. Decisions

All closed. Recorded so the build does not relitigate them.

| Decision | Answer |
|---|---|
| How someone becomes rep | The creator is `owner`, and owner implies rep. They may promote a member to `rep` or transfer ownership. No application, no verification queue. §6 |
| What gates joining | Invite code puts you in a pending queue; the rep approves. No schedule-fingerprint scoring in v1 — parked, §17. |
| Who may post | Anyone in the classroom, published immediately. The rep can hide a post. |
| How a post reaches the tracker | It appears automatically in Today and Deadlines, badged with the section code, and the student can dismiss it. Nothing is copied into their private `deadlines` table. |
| Who sees the submission log | The whole class, by name, **per post only**, and only on posts explicitly flagged as needing one. No aggregate across posts anywhere. §9 |
| Classroom membership | One classroom per student per term, enforced by the database. |
| The suffix in `BSCS-4B-M` | The **campus**: `M` Manila, `T` Taguig, `C` Cavite, `V` Visayas. A closed enum. Two sections differing only by campus are different classrooms. |
| Term rollover | The classroom archives with the term. The rep taps *Start next term's classroom*, which creates the new group and invites the previous members — who each accept with one tap. Members are never carried silently: §9's consent is given per classroom, and block sections reshuffle between years anyway. §7 |
| Post editing | The author may edit their own post at any time; `edited_at` is set and the row shows *edited*. No edit history — this is a section tracker, not a wiki. Only a change to `due_at` re-notifies, when push lands. |
| Which scheduler for push | **GitHub Actions** on a `schedule:` trigger. Free, no new infrastructure, 5-minute floor. Not the worker: `apps/worker` is deliberately the smallest thing in the system, holds no database access at all (`07-AUTH-ERS.md §4.2`), and its value comes from staying that way. §13 |
| Push notifications | Deferred to Phase 5. Build the tracker first. |
| Irregular students | Parked. §17 |
| Language | English only, like the rest of the app. There is no i18n module and this feature does not introduce one. |

---

## 4. The model: a classroom is a group with a section identity

`sections` (migration `002`) is **per course** — one row per course a section
takes, `'BSCS 3-1'` for `CS 3105`. What a student means by `BSCS-4B-M` is a
**block section**: a cohort that takes every subject together, which is how TUP
enrols. That is one thing, not nine, and `sections` cannot represent it.

Rather than add a third membership concept next to `groups` and `class_reps`,
extend `groups` with a `kind`. It already has membership, roles, invite codes,
and RLS that avoids the recursion trap — and `deadlines.group_id` already points
at it. A classroom is a group with stricter joining rules, not a new species.

```sql
-- 031_classrooms.sql

alter table public.groups
  add column kind         text not null default 'study'
                          check (kind in ('study','classroom')),
  add column term_id      uuid references public.terms(id) on delete cascade,
  add column section_code text,                  -- canonical, 'BSCS-4B-M'
  add column program_code text,                  -- 'BSCS'
  add column year_level   smallint check (year_level between 1 and 6),
  add column campus       text check (campus in ('M','T','C','V')),
  add column who_can_post text not null default 'anyone'
                          check (who_can_post in ('rep','anyone')),
  add column archived_at  timestamptz;

-- A classroom must carry its section identity; a study group must not be
-- allowed to half-carry one. Shape enforced here rather than in the route.
alter table public.groups
  add constraint groups_classroom_shape check (
    kind <> 'classroom'
    or (term_id is not null and section_code is not null and campus is not null)
  );

-- One classroom per section per term. The database decides this, not a client
-- that remembered to check first.
create unique index idx_one_classroom_per_section
  on public.groups (term_id, section_code)
  where kind = 'classroom' and archived_at is null;

-- 012 wrote the role check inline, so Postgres named it group_members_role_check.
-- Confirm with \d group_members before running this.
alter table public.group_members
  drop constraint group_members_role_check,
  add constraint group_members_role_check
    check (role in ('owner','rep','member'));

-- term_id is denormalised from the parent group so "one classroom per term" can
-- be a unique index rather than a trigger that fires too late. Null for study
-- groups, which stay unconstrained.
alter table public.group_members
  add column term_id uuid references public.terms(id) on delete cascade,
  -- Copied at join time. The submission log must show a name, and profiles is
  -- own-row-only under RLS — which it stays. §8.
  add column display_name text;

create unique index idx_one_classroom_per_student_per_term
  on public.group_members (user_id, term_id)
  where term_id is not null;

create index idx_groups_classroom_lookup
  on public.groups (term_id, section_code)
  where kind = 'classroom';
```

Both denormalised columns are filled by a trigger, never by the client:

```sql
create or replace function public.fill_membership_denormals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select g.term_id into new.term_id
    from public.groups g where g.id = new.group_id and g.kind = 'classroom';
  select p.full_name into new.display_name
    from public.profiles p where p.id = new.user_id;
  return new;
end $$;

create trigger group_members_denormals
  before insert on public.group_members
  for each row execute function public.fill_membership_denormals();
```

`security definer` is required here: the trigger reads the joining student's
`profiles` row, which own-row RLS would otherwise hide from itself during an
insert performed by a rep's approval call.

A student who later edits their name updates their own membership rows through
the profile save path — the only write path for `display_name`, and covered by
`members_update_own` from `012`.

### Section codes, and the campus letter

`BSCS 4B-M`, `bscs-4b m`, `BSCS4B‑M` and `BSCS-4B-M` are one section typed four
ways. Free text here produces four classrooms and the feature fails on day one.

New module `packages/core/src/sections/parse.ts`, exported from
`packages/core/src/index.ts`, with tests in `packages/core/tests/`, in the same
shape as `schedule/parse.ts`:

```ts
export type Campus = 'M' | 'T' | 'C' | 'V'

export interface SectionCode {
  program: string       // 'BSCS'
  year: number          // 4
  block: string         // 'B'
  campus: Campus        // 'M' — Manila
  canonical: string     // 'BSCS-4B-M'
}

export function parseSectionCode(raw: string): SectionCode | null
export function formatSectionCode(parsed: SectionCode): string
export const CAMPUS_LABEL: Record<Campus, string>  // M → 'Manila'
```

Rules: uppercase; strip everything that is not alphanumeric; tolerate the year
and block written together or apart; require the campus letter; reject anything
outside `M|T|C|V`; return `null` rather than storing a guess. The campus letter
is what stops Manila's `BSCS-4B-M` colliding with Taguig's `BSCS-4B-T`, so it is
neither optional nor free text.

`profiles.section_label` already exists and shows in the sidebar; it pre-fills
the field, and is migrated to canonical form in the same migration — rows that
do not parse are left untouched rather than mangled. `profiles.campus` (default
`'manila'`) is the cross-check: a Manila student typing a `-T` code is warned
before the classroom is created, not after.

---

## 5. Joining

One table.

```sql
create table public.group_join_requests (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','withdrawn')),
  -- The claim, frozen at request time. A profile edited afterwards must not
  -- change what the rep was actually looking at when they decided.
  claimed_student_number text,
  claimed_full_name      text,
  claimed_section_code   text,
  message     text check (char_length(message) <= 200),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create index idx_join_requests_group_pending
  on public.group_join_requests (group_id) where status = 'pending';

alter table public.group_join_requests enable row level security;

create policy join_requests_read_own on public.group_join_requests
  for select using (user_id = (select auth.uid()));
create policy join_requests_read_rep on public.group_join_requests
  for select using (public.is_group_rep(group_id));
create policy join_requests_create on public.group_join_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy join_requests_withdraw on public.group_join_requests
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'withdrawn');
```

Approval cannot be a plain `update`, because admitting a member is an insert
**for another user**, and `members_join` in `012` requires
`user_id = auth.uid()`. It belongs in a security-definer function, which also
makes the membership row and the decision one transaction:

```sql
create or replace function public.is_group_rep(target_group uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = target_group
      and m.user_id = (select auth.uid())
      and m.role in ('owner','rep')
  );
$$;

create or replace function public.decide_join_request(request uuid, approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.group_join_requests;
begin
  select * into r from public.group_join_requests where id = request for update;
  if not found                           then raise exception 'join request not found'; end if;
  if not public.is_group_rep(r.group_id) then raise exception 'not permitted';          end if;
  if r.status <> 'pending'               then raise exception 'already decided';        end if;

  if approve then
    insert into public.group_members (group_id, user_id, role)
    values (r.group_id, r.user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  update public.group_join_requests
     set status     = case when approve then 'approved' else 'rejected' end,
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = request;
end $$;

revoke execute on function public.decide_join_request(uuid, boolean) from public, anon;
grant  execute on function public.decide_join_request(uuid, boolean) to authenticated;
revoke execute on function public.is_group_rep(uuid) from public, anon;
grant  execute on function public.is_group_rep(uuid) to authenticated;
```

The `revoke`/`grant` pair is not decoration. A `security definer` function is
`execute`-able by `public` by default, which would hand `anon` the ability to
approve members into a classroom. Every function in this plan needs it, and
`023_service_role_grants.sql` is the precedent for where such grants live.

The invite code is `groups.invite_code`, already unique and already generated by
`012`. It is rotatable, because a code pasted into the wrong group chat is a
thing that will happen. Possession of the code buys a place in the queue and
nothing more.

---

## 6. The rep — step by step, with roles

The question worth answering plainly: **how does the app know who the class rep
is?** It knows because a person created the classroom, and creation is the
claim. Nothing verifies it against the registrar, because nothing can — see
`07-AUTH-ERS.md §3`, and ADR-005. What protects the class is that a fake
`BSCS-4B-M` stays empty: nobody joins it, because the invite link comes from the
group chat the real class already trusts.

### Roles, in full

| Role | Where it lives | May do |
|---|---|---|
| `owner` | `group_members.role` | Everything `rep` may do, plus promote/demote a rep, transfer ownership, archive the classroom, start next term's. Exactly one per classroom. |
| `rep` | `group_members.role` | Approve/reject join requests, remove a member, hide a post, rotate the invite code. |
| `member` | `group_members.role` | Post, read, mark their own state, dismiss a post, leave. |
| *(non-member)* | — | Nothing. A classroom is invisible apart from its section code and member count on the join screen. |

`owner` is not a separate column — it is `role = 'owner'`, and `is_group_rep()`
returns true for it. There is no fourth role, and nothing outside this feature
reads these values.

### The flow

**1. Ana creates the classroom.**
Settings → Classroom → *Create*. The form pre-fills from her profile: program
`BSCS`, year `4`, block typed as `B`, campus `M` from `profiles.campus`.
`parseSectionCode` canonicalises to `BSCS-4B-M` and shows it back before she
confirms.

`POST /api/classrooms` inserts `groups {kind:'classroom', term_id: <current>,
section_code, program_code, year_level, campus, created_by}` then
`group_members {user_id, role:'owner'}`, whose trigger fills `term_id` and
`display_name`.

*If `BSCS-4B-M` already exists this term*, the unique index rejects the insert.
The route catches `23505` and turns it into a join request against the existing
classroom: *Ben already created BSCS-4B-M — ask to join?* A constraint violation
must never reach the screen.

**2. Ana shares the invite.**
`/classroom/join/<invite_code>`, pasted into the section's group chat. She can
rotate the code from the member list; the old link stops working immediately.

**3. Ben opens the link.**
He sees the section code, the member count, who the rep is, and the consent copy
from §9 — *anyone in this classroom will see when you mark work as submitted,
and nothing else*. He taps *Request to join*, optionally with a short message.

The insert freezes his claimed name, student number and section label as they
read at that moment.

*If Ben is already in a classroom this term*, `idx_one_classroom_per_student_per_term`
would reject the eventual approval, so the join screen checks first and offers:
*leave BSCS-4A-M to join BSCS-4B-M?*

**4. Ana reviews.**
Her classroom screen shows a *Requests* section — name, student number, claimed
section, message, and when it was asked. Two buttons, both calling
`decide_join_request(request, approve)`.

She is deciding on a claim, not on evidence, and the screen says so: *OneTUP
cannot verify this. Approve people you recognise.* That is more honest than a
confidence score, and it plays to what a rep is actually good at — they know
their classmates by name.

**5. Ben is in.**
`group_members` gains his row with `role = 'member'`. His tracker begins showing
class posts immediately, including ones published before he joined that are
still open.

**6. Ana hands over, or disappears.**
Ana taps *Make rep* on Cy, and Cy can approve joins. If Ana graduates, she
transfers ownership. If Ana simply stops opening the app, the classroom is
stranded — so after **60 days with no owner activity** the longest-standing
`rep` may claim ownership from the member list, with every member told in-app.
Without that escape hatch one dormant account holds a section for a semester.

**7. Ben leaves.**
*Leave classroom*, which `members_leave` in `012` already allows. His
`class_post_states` rows cascade away, so his submission marks disappear from
every log at the same moment. The path is visible in the UI, not merely possible
in the schema.

---

## 7. The shared tracker

### The choice

**Fan-out on write** — one `deadlines` row per member. Tempting: every screen
already renders `deadlines`, and offline sync already carries it. Rejected,
because an edit ("moved to Friday") then has to chase thirty copies, the copies
drift, and there is nowhere to read a submission log from.

**Shared row plus per-member state** — recommended, and what follows.

```sql
-- 032_class_posts.sql
create table public.class_posts (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  author_id       uuid references auth.users(id) on delete set null,
  -- The submission this came from, when it came through the share sheet.
  submission_id   uuid references public.announcement_submissions(id) on delete set null,
  course_id       uuid references public.courses(id) on delete set null,
  kind            text not null default 'note'
                  check (kind in ('note','task','exam','quiz','suspension','room_change')),
  title           text not null check (char_length(title) between 1 and 140),
  detail          text check (char_length(detail) <= 2000),
  -- Set, and it appears in every member's tracker. Null, and it is a notice.
  due_at          timestamptz,
  requires_submission boolean not null default false,
  pinned          boolean not null default false,
  status          text not null default 'published'
                  check (status in ('published','hidden')),
  hidden_by       uuid references auth.users(id) on delete set null,
  edited_at       timestamptz,
  content_hash    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The same message pasted by five people is one post.
create unique index idx_class_posts_dedupe
  on public.class_posts (group_id, content_hash)
  where content_hash is not null;

create index idx_class_posts_group_due
  on public.class_posts (group_id, due_at) where status = 'published';

select public.attach_updated_at('public.class_posts');

create table public.class_post_states (
  post_id      uuid not null references public.class_posts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'open'
               check (status in ('open','done','submitted','dismissed')),
  submitted_at timestamptz,
  note         text check (char_length(note) <= 200),
  -- Personal. One student wanting three days' warning does not impose it.
  reminder_offsets integer[],
  updated_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);

select public.attach_updated_at('public.class_post_states');

create index idx_class_post_states_user on public.class_post_states (user_id);
```

A state row is written lazily — the first time a student touches the post. No
row means `open`, which keeps the table proportional to activity rather than to
members × posts.

`submitted_at` is set by a trigger when `status` becomes `submitted` and cleared
when it leaves, so a client cannot backdate a submission mark.

### What the student sees

The tracker is a **union**: personal `deadlines` (unchanged, still private,
still theirs) plus `class_posts` with a `due_at`, left-joined to that student's
own state row. Class-sourced items are badged with the section code and carry a
dismiss control that writes `status = 'dismissed'`.

A class post is never copied into a student's private table. That preserves one
of this product's better properties — a student can always tell which of their
commitments they created and which the class did — and it means `deadlines`
stays exactly as private as it is today, with no policy change.

Touch points: `lib/queries/today.ts` and `components/deadlines/deadlines-view.tsx`
merge the two sources; `deadline-row.tsx` grows the source badge (§11.3).

### The publish path

`/api/announcements/ingest` already does the hard part — it takes a pasted or
shared message and returns `{course_code, type, event_date, summary, detail,
creates_deadline, confidence}` as a proposal nobody has published yet.
`share-intake.tsx` gains one control (§11.2, screen 5).

Publishing writes the `class_posts` row, sets `due_at` from the extracted date
when `creates_deadline` is true, and carries `content_hash` over from
`announcement_submissions` so the dedupe index can work. There is also a plain
*New post* form for when there is nothing to paste, writing the same row with
`content_hash` null.

The `announcements` row is still written for the course-wide community feed when
the student wants one. These are different audiences — a classroom is thirty
people who share a timetable, the feed is everyone taking `CS 3105` — and both
are useful.

### Term rollover

At term end the outgoing classroom is archived (`archived_at`), which drops it
out of `idx_one_classroom_per_section` so next term's can be created. Posts stay
readable; nothing new can be published.

The owner taps *Start next term's classroom*: a new `groups` row for the new
`term_id`, and a `group_join_requests` row pre-created for every previous member
with status `pending` and the claim copied across. Each of them accepts with one
tap from Today. Nobody is moved silently — the §9 consent is given per classroom,
and block sections reshuffle between years anyway.

### RLS

```sql
alter table public.class_posts       enable row level security;
alter table public.class_post_states enable row level security;

create policy class_posts_read on public.class_posts
  for select using (
    public.is_group_member(group_id)
    and (
      status = 'published'
      or author_id = (select auth.uid())
      or public.is_group_rep(group_id)
    )
  );

create policy class_posts_write on public.class_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id)
    and (
      public.is_group_rep(group_id)
      or exists (select 1 from public.groups g
                 where g.id = group_id
                   and g.who_can_post = 'anyone'
                   and g.archived_at is null)
    )
  );

-- An author may edit their own post; a rep may hide anyone's.
create policy class_posts_edit on public.class_posts
  for update using (author_id = (select auth.uid()) or public.is_group_rep(group_id))
  with check  (author_id = (select auth.uid()) or public.is_group_rep(group_id));

create policy class_posts_delete on public.class_posts
  for delete using (author_id = (select auth.uid()));
```

`who_can_post` defaults to `anyone`, per §3. A rep who must approve every quiz
reminder stops approving them by week three, and the class stops posting. The
remedies are a one-tap hide, the dedupe index, and rate limiting:

```ts
// lib/api/rate-limit.ts — POLICIES
class_post: { limit: 10, windowSeconds: 3600 },
```

---

## 8. The submission log

`class_post_states.status = 'submitted'` with `submitted_at`. On a post flagged
`requires_submission`, every member of the classroom sees the list. That is the
whole mechanism.

```sql
create policy states_all_own on public.class_post_states
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The single place in this product where one student sees another's state.
-- Narrow on purpose: only on a post whose author explicitly asked for a log,
-- and only to members of that post's classroom.
create policy states_read_class on public.class_post_states
  for select using (
    exists (
      select 1 from public.class_posts p
      where p.id = post_id
        and p.requires_submission
        and p.status = 'published'
        and public.is_group_member(p.group_id)
    )
  );
```

**Names come from `group_members.display_name`, not from `profiles`.**
`profiles` is own-row-only under RLS (`003`), and it stays that way — widening it
so a log can render a name would leak student numbers and program data to every
classmate as a side effect. The name is copied into the membership row at join
time, which is the only field the log needs.

**`requires_submission` is set at publish and cannot be turned on later.** A rep
who could flip it retroactively would be publishing a list about people who
answered under different terms. Enforced in the database, not just the UI:

```sql
create or replace function public.freeze_requires_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.requires_submission and not old.requires_submission then
    raise exception 'requires_submission cannot be enabled after publishing';
  end if;
  return new;
end $$;

create trigger class_posts_freeze_submission
  before update on public.class_posts
  for each row execute function public.freeze_requires_submission();
```

Turning it *off* is allowed, and hides the log.

---

## 9. The privacy boundary

`00-INDEX.md` lists as non-negotiable:

> **Attendance and grades are private to the student.** No aggregates, no
> faculty visibility, no leaderboards.

The submission log is neither attendance nor grades, and no policy in this plan
gives anyone sight of either. But it is the first feature in OneTUP where one
student sees another's status by name, so the boundary is stated here rather
than discovered later:

1. **Opt in at the post.** Only posts flagged `requires_submission` have a log,
   the flag is set at publish, and it cannot be enabled afterwards (§8).
2. **Opt in at the join.** The join screen says plainly: *anyone in this
   classroom will see when you mark work as submitted, and nothing else.*
3. **Say what it is.** The log is a self-declaration. The UI must never let it
   read as proof that anyone submitted anything, and must never imply a grade.
4. **Per post, never across posts.** No screen shows "Cy: 4 of 9", no completion
   percentage per member, no ordering of members by anything. A cross-post total
   is a leaderboard wearing a different hat, and it is the one line this feature
   must not cross. This is a review criterion, not a preference.
5. **Never widen it.** No submission log for attendance. No "who is absent
   today". Those are the same idea aimed at data the product has already
   promised to keep private.
6. **Leaving removes it.** `on delete cascade` handles the data; the leave path
   must be visible in the UI (§6 step 7).
7. **Not submitted is not an error.** In the log, a member who has not marked
   anything renders in `--label-tertiary`, never in `--danger`. §11.

---

## 10. Offline

Both new tables join the offline set, plus `group_members` so a log renders with
no network. They are small — a term of posts for one section is tens of rows.

```ts
// lib/offline/db.ts — EntityName
| 'class_posts'
| 'class_post_states'
| 'group_members'

// lib/offline/sync.ts — OFFLINE_SET
{ entity: 'class_posts', table: 'class_posts', filter: (q) => q.gte('created_at', daysAgo(60)) },
{ entity: 'class_post_states', table: 'class_post_states' },
{ entity: 'group_members', table: 'group_members' },
```

One thing will break if it is missed: `primaryKeyOf()` returns `'id'` for
everything except `user_preferences`, and `class_post_states` has a composite
primary key `(post_id, user_id)`. Both `primaryKeyOf` and `naturalKeyFor` need a
case for it, the way `attendance_records` already has one:

```ts
function primaryKeyOf(entity: EntityName): string {
  if (entity === 'user_preferences') return 'user_id'
  if (entity === 'class_post_states') return 'post_id'   // paired with the natural key below
  return 'id'
}

function naturalKeyFor(entity: EntityName): string | undefined {
  switch (entity) {
    case 'class_post_states': return 'post_id,user_id'
    // ...existing cases
  }
}
```

Without it, every offline "I've submitted" tap queues a mutation against a
column the table does not have — silently, and on exactly the write students
make most. Marking submitted is the highest-value offline write in the feature:
a student taps it walking out of a room with no signal.

Class posts are **read-only offline** for everyone but their author's own state:
publishing needs the dedupe check and the rate limiter, both server-side, so the
composer is disabled offline with the existing `.offline-note` treatment.

---

## 11. The interface

Everything here is assembled from `src/design/*` and `components/ui/*`. No new
primitive is introduced. The rules the rest of the app follows apply unchanged:

- **Crimson means one thing.** `--accent` marks the active tab, the primary
  action, and the assistant. A classroom badge, a section code, a submission
  tick — none of them may use it. `tokens.css` says this outright and it is the
  easiest rule in the system to break by accident.
- **Every surface is white**, so separation is the `.card` hairline plus
  `--shadow-card`, never a tonal step.
- **`--target-min: 44px`** on every control, at every breakpoint.
- **Spacing and type come from tokens**, never ad-hoc pixels: `--space-*`, and
  the `type-*` classes from `typography.css`.
- **Reduced motion, reduced transparency and increased contrast** are already
  handled by the token media queries. Nothing here may hard-code a blur, an
  opacity, or a duration outside them.

### 11.1 Where it lives

`/classroom`, added to `NAV_GROUPS` in `components/app/nav-items.ts`, in the
**Daily** group after Announcements.

The phone bar is not touched. `PHONE_NAV` is four items plus the assistant well,
and the file already argues why a fifth destination becomes a menu; a new
sidebar item falls into `MORE_NAV` automatically and is two taps away on a
phone. `titleFor()` picks up the label with no change.

No badge count. `NavItem.badge` supports `'deadlines' | 'announcements'`, and a
class post with a due date is already counted by Deadlines — counting it twice
would make the two numbers disagree.

### 11.2 Screens

**1 — `/classroom` (member view).** The default screen once you are in one.

```
┌──────────────────────────────────────────────┐
│ BSCS-4B-M                    31 members  ›   │   Card, type-title-2 + type-footnote
│ 2nd Semester AY 2025–2026 · Manila           │
├──────────────────────────────────────────────┤
│ SectionHeader  Pinned                        │
│ ListGroup                                    │
│  ▸ No classes Friday — suspension     Wed    │
├──────────────────────────────────────────────┤
│ SectionHeader  Recent    [+ New post]        │
│ ListGroup                                    │
│  ▸ Case Study 2      Fri 5:00 PM   24/31 ✓   │
│  ▸ Quiz moved to Thursday          edited    │
└──────────────────────────────────────────────┘
```

`Card` for the header, `SectionHeader` with a `ButtonLink size="sm"` action,
`ListGroup` + `ListRow` for posts. Due date and submission count are the
`trailing` slot; `type-data` for `24/31`. Empty state: `EmptyState` with
`IconClassroom`, *Nothing posted yet. Anyone in this classroom can post.*

**2 — `/classroom/new` (create).** A single `Card` form: program, year, block,
campus. The canonical code is echoed live under the fields in `type-data`, so
`bscs 4b m` visibly becomes `BSCS-4B-M` before submission. Campus defaults from
`profiles.campus` and mismatches warn inline in `--warning`, never blocking.
Primary action `Button variant="accent" block`.

**3 — `/classroom/join/[code]` (the invite landing).** Reachable signed-out; it
routes through sign-in and returns. Shows section code, member count, rep name,
and — not in small print — the consent copy from §9:

> Anyone in this classroom will see when you mark work as submitted, and nothing
> else. Your attendance, grades and personal deadlines stay private.

Actions: `Button variant="accent"` *Request to join*, `variant="plain"` *Not
now*. If the student is already in another classroom this term, the primary
action becomes *Leave BSCS-4A-M and request to join*, with the consequence
spelled out above the button rather than in a confirm dialog.

**4 — `/classroom/members` (rep view).** Requests first, then members.

Requests are `ListRow`s: `title` the claimed name, `subtitle` the student number
and claimed section, `trailing` two `IconButton`s — `IconCheck` and `IconClose`.
Above them, one line in `type-footnote text-[var(--label-secondary)]`: *OneTUP
cannot verify these. Approve people you recognise.*

Members are `ListRow`s with `role` shown as a `Badge tone="neutral"` for
`owner`/`rep`. Rep-only affordances (*Make rep*, *Remove*, *Rotate invite code*)
open in the existing `Sheet` on tap, and are simply absent for members — not
present-and-disabled, which teaches nothing.

Destructive actions use `Button variant="destructive"` and name what will happen
(*Remove Ben Cruz from BSCS-4B-M*).

**5 — the publish control, in `share-intake.tsx`.** Two checkboxes appended to
the existing review card, not a new screen:

```
☑  Also post to BSCS-4B-M
☐  Ask who has submitted
```

The second is disabled with a `type-caption-1` explanation until the first is
checked, and its label carries the consequence: *everyone in the classroom will
see who has marked this submitted*. Checked state cannot be changed after
publishing (§8), and the UI says so at the point of choosing, not afterwards.

**6 — `/classroom/posts/[id]` (post detail and log).** Title, detail, course,
due date, author, and *edited* when `edited_at` is set. Then the student's own
control — a full-width `Button variant="accent"` *I've submitted* that becomes a
`variant="plain"` *Submitted · undo* once tapped.

Below it, only when `requires_submission`:

```
SectionHeader  Submissions          24 of 31       ← type-data, aria-live="polite"
ListGroup
  Ana Reyes            ✓ 2 hours ago              ← IconCheck, --ok
  Ben Cruz             ✓ yesterday
  Cy dela Peña         Not yet                    ← type-footnote, --label-tertiary
```

Submitted rows sort first, then alphabetically. There is no sort control, no
percentage, and no link from a name to anything — a name in this list is a name,
not an entry point to a person's record.

### 11.3 The class badge in Today and Deadlines

`deadline-row.tsx` gains one `Badge tone="neutral"` carrying the section code, in
the same row as the existing urgency dot. `URGENCY_COLOR` is untouched: a class
post's urgency is computed by the same `urgencyOf()` as everything else, because
a student does not care who created a thing that is due in four hours.

Dismiss is a row action in the detail pane, not a swipe — the list already
reserves swipe for nothing, and adding a destructive gesture to a shared item is
how a student loses a deadline they meant to keep.

### 11.4 Components

New, all under `components/classroom/`:

| File | What |
|---|---|
| `classroom-view.tsx` | Screen 1 |
| `classroom-create.tsx` | Screen 2 |
| `classroom-join.tsx` | Screen 3 |
| `classroom-members.tsx` | Screens 4, including the rep sheet |
| `class-post-row.tsx` | A post in a `ListGroup` |
| `class-post-detail.tsx` | Screen 6, including the log |
| `submission-log.tsx` | The list in screen 6, extracted because §9.4 makes it worth reviewing on its own |

Reused unchanged: `Card`, `SectionHeader`, `ListGroup`, `ListRow`, `EmptyState`,
`Badge`, `Divider`, `Button`, `ButtonLink`, `IconButton`, `Sheet`, `NavBar`.

One addition to `components/ui/icon.tsx`: `IconClassroom`, wrapping Tabler's
`IconUsersGroup` in the same shape as the existing wrappers. Tabler ships no
filled variant of it — outline is correct here, alongside the file's existing
`IconRefresh`, `IconWalk` and `IconRoute`. Every other icon
this feature needs — `IconCheck`, `IconClose`, `IconPlus`, `IconClock`,
`IconWarning`, `IconChevronRight`, `IconLock` — already exists.

### 11.5 States

Every screen specifies four, because the ones that get skipped are the ones
students actually hit:

- **Loading.** The existing skeleton treatment; never a spinner on a list.
- **Empty.** `EmptyState` with a specific sentence, never "No data". *Nothing
  posted yet. Anyone in this classroom can post.*
- **Offline.** `.offline-note` above the composer, which is disabled; reading and
  marking submitted both keep working (§10).
- **Error.** The route's `errors.*` message rendered inline in `--danger`, with
  the action still tappable so a retry does not need a reload.

Not-yet-submitted is not one of these. It is a normal state and is styled as one
(§9.7).

### 11.6 Motion

`motion/react` with `spring` and `transition` from `@/design/motion`, matching
`deadlines-view.tsx`. Three places only:

- A post entering the list, and a dismissed one leaving, via `AnimatePresence`.
- The submission tick, which is `--ease-spring` on `transform` only — never on
  colour, per the token comment.
- The rep sheet, which is the `Sheet` component's own presentation.

Reduced motion is handled by tokens; nothing here needs a `useReducedMotion`
branch.

### 11.7 Accessibility

- The submission count is `aria-live="polite"`, so a screen reader hears
  *25 of 31* when someone marks submitted while the page is open.
- Each log row has one accessible name: *Ana Reyes, submitted 2 hours ago*. The
  tick is `aria-hidden`, because a green check alone is a colour-only signal.
- Approve/reject `IconButton`s carry `aria-label` naming the person:
  *Approve Ben Cruz*.
- The join screen's consent copy is inside the same landmark as the button, not
  a footnote after it, so it is read before the action is reached.
- Contrast: every pairing in §11.2 uses `--label` or `--label-secondary` on
  white, which clears AA. `--ok` is never the sole carrier of meaning.
- Focus order on screen 4 is requests before members, matching visual order.

---

## 12. Routes and API surface

Everything follows the existing conventions — `authenticated()` from
`lib/api/handler.ts`, typed `errors.*`, `enforceLimit()` where a write is
cheap to spam.

| Route | Method | Does | Limiter |
|---|---|---|---|
| `/api/classrooms` | `POST` | Create; catches `23505` and returns a join-request offer | — |
| `/api/classrooms/[id]/invite` | `POST` | Rotate `invite_code`; rep only | — |
| `/api/classrooms/[id]/requests` | `POST` | Create a join request from an invite code | `class_join` |
| `/api/classrooms/requests/[id]` | `PATCH` | Approve/reject via `decide_join_request` | — |
| `/api/classrooms/[id]/members/[userId]` | `PATCH`/`DELETE` | Promote, demote, transfer, remove; rep or owner | — |
| `/api/classrooms/[id]/posts` | `POST` | Publish; hashes, dedupes, writes the row | `class_post` |
| `/api/classrooms/posts/[id]` | `PATCH` | Edit, hide, unhide | — |

Reads go straight through Supabase from the client, as elsewhere in the app —
RLS is the authority, and a route that re-implements it is a second place to get
it wrong. Writes that cross a user boundary (approval, removal) are routes,
because they need the security-definer functions.

Two new rate-limit buckets:

```ts
class_post: { limit: 10, windowSeconds: 3600 },
class_join: { limit: 10, windowSeconds: 3600 },
```

Log lines follow the existing structured-JSON shape: `classroom.created`,
`classroom.join_requested`, `classroom.join_decided`, `class_post.published`,
`class_post.hidden`. No line carries a title, a name, or a student number.

---

## 13. Notifications — deferred, deliberately

The push stack is already built end to end: `public/sw.js` handles `push` and
`notificationclick`, `notification_subscriptions` stores endpoints per device,
`scheduled_notifications` holds what is due with `unique (user_id, kind,
entity_id, fire_at)` making a double-enqueue idempotent, and
`/api/notifications/dispatch` applies quiet hours and per-kind settings.

**Nothing calls dispatch on a schedule**, so everything enqueued sits unsent.
That is a cron entry, not a feature, and it is not on this feature's critical
path — the tracker is useful the moment a student opens the app.

**The scheduler is GitHub Actions** (§3): a `schedule:` workflow posting to the
dispatch route with `WORKER_SECRET`. Free, no new infrastructure, a 5-minute
floor that is fine for deadline reminders. Vercel Cron's free tier is daily
only. `apps/worker` was considered and rejected: it holds no database access at
all by design (`07-AUTH-ERS.md §4.2`), and its security value comes from being
the smallest thing in the system.

When Phase 5 lands, it is rows and settings — no new machinery:

| Kind | When | Quiet hours |
|---|---|---|
| `class_post` | Something is posted to your classroom | Suppressed |
| `class_due` | Before a class post's `due_at`, at the member's own offsets | Suppressed |
| `class_suspension` | A suspension is posted | **Delivered** — add to `ALWAYS_DELIVER` next to `wake_alarm` |
| `join_request` | Someone asks to join, to the rep | Suppressed |

Fan-out must be a `security definer` function called in the same transaction as
the insert, because a member cannot write a `scheduled_notifications` row for
another user under RLS — and a post that published but notified nobody is the
failure mode worth designing out.

The iOS constraint, when the time comes: Web Push works on iPhone and iPad only
after the app is added to the Home Screen from Safari (16.4+), and permission
must come from a real tap. `pushSupport()` already returns `requires_install`
for exactly this; the classroom onboarding needs to *use* it, because a student
who joins on an iPhone and never installs will never hear about a suspension.

---

## 14. Build order

Each phase is shippable alone. Phase 1 is useful with nothing after it.

### Phase 1 — Classrooms exist (~1 week)

- [x] `packages/core/src/sections/parse.ts` — `parseSectionCode`,
      `formatSectionCode`, `CAMPUS_LABEL`; export from `index.ts`
- [x] `packages/core/tests/sections-parse.test.ts`
- [x] `supabase/migrations/031_classrooms.sql` — columns, shape constraint, both
      unique indexes, role check, denormal trigger, `group_join_requests` + RLS,
      `is_group_rep`, `decide_join_request`, grants
- [x] Backfill `profiles.section_label` to canonical form in the same migration
- [x] Regenerate `packages/core/src/database.types.ts`
- [x] `app/(app)/classroom/page.tsx`, `new/page.tsx`, `members/page.tsx`,
      `join/[code]/page.tsx`
- [x] `components/classroom/classroom-view.tsx`, `classroom-create.tsx`,
      `classroom-join.tsx`, `classroom-members.tsx`
- [x] `components/ui/icon.tsx` — `IconClassroom`
- [x] `components/app/nav-items.ts` — one entry in the Daily group
- [x] `api/classrooms/route.ts`, `[id]/invite`, `[id]/requests`,
      `requests/[id]`, `[id]/members/[userId]`
- [x] `lib/api/rate-limit.ts` — `class_join`
- [x] `23505` → join-request offer, in the create route

### Phase 2 — The shared tracker (~1 week)

- [x] `supabase/migrations/032_class_posts.sql` — both tables, dedupe index,
      RLS, `attach_updated_at`, `submitted_at` trigger
- [x] Regenerate `database.types.ts`
- [x] `components/announcements/share-intake.tsx` — the *Also post to* control
- [x] `components/classroom/class-post-row.tsx`, `class-post-detail.tsx`
- [x] `app/(app)/classroom/posts/[id]/page.tsx`
- [x] `api/classrooms/[id]/posts/route.ts`, `posts/[id]/route.ts`
- [x] `lib/api/rate-limit.ts` — `class_post`
- [x] `lib/queries/today.ts` — union personal deadlines with class posts
- [x] `components/deadlines/deadlines-view.tsx` — same union, dismiss action
- [x] `components/deadlines/deadline-row.tsx` — section `Badge`

### Phase 3 — The submission log (~3 days)

- [x] `states_read_class` policy and `freeze_requires_submission` trigger
      (may ship inside `032` if Phase 2 and 3 land together)
- [x] `components/classroom/submission-log.tsx`
- [x] *I've submitted* control and its undo in `class-post-detail.tsx`
- [x] The consent copy on the join screen and the publish control
- [x] The §9.4 review check: grep for any cross-post aggregate before merge

### Phase 4 — Offline (~2 days)

- [x] `lib/offline/db.ts` — three `EntityName`s
- [x] `lib/offline/sync.ts` — three `OFFLINE_SET` entries
- [x] `primaryKeyOf` and `naturalKeyFor` cases for `class_post_states`
- [x] Composer disabled offline with `.offline-note`
- [~] Verify a queued *I've submitted* survives a reload and a reconnect —
      the keying it depends on is covered by `apps/web/tests/offline-keys.test.ts`
      (composite local key, composite conflict target); the reconnect itself has
      not been exercised against a real dropped connection

### Phase 5 — Push (~3 days)

- [ ] `.github/workflows/dispatch.yml` on a `schedule:` trigger
- [ ] Verify a plain deadline reminder arrives on a real installed PWA **before**
      adding any classroom kind
- [ ] Four new kinds; `class_suspension` into `ALWAYS_DELIVER`
- [ ] `publish_class_post()` security-definer fan-out, plus grants
- [ ] Settings toggles reading `user_preferences.notification_settings`
- [ ] The `requires_install` prompt at join time

### Phase 6 — Term rollover and tidy-up (~3 days)

- [ ] Archive on term end; *Start next term's classroom*
- [ ] Reconcile `class_reps` (per-course, announcement trust, `011`) with
      `group_members.role = 'rep'`. Two rep concepts is one too many, but it can
      wait until both are real.

---

## 15. Testing

Matching `09-IMPLEMENTATION-PLAN.md`, and the existing suites in
`packages/core/tests/`.

**Unit — `packages/core`.** `parseSectionCode` is the one piece of pure logic
here and it carries the whole feature's identity, so it gets the treatment
`schedule-parse.test.ts` gets: the four spellings of `BSCS-4B-M` all
canonicalising identically; each campus letter; a rejected fifth letter; missing
campus; missing block; lowercase; unicode hyphen (`‑`); leading and trailing
space; a year outside 1–6; `null` rather than a guess for junk.

**RLS — the existing suite.** One case per policy, each written as *the wrong
person gets nothing*:

- a non-member reads zero `class_posts` for a classroom
- a member reads another member's `class_post_states` **only** when
  `requires_submission` is true, and zero rows when it is false
- a member cannot insert a `class_post_states` row for another user
- a member cannot `update` another member's `group_members` row
- `decide_join_request` called by a non-rep raises
- `anon` cannot execute `decide_join_request` or `is_group_rep`
- enabling `requires_submission` after publish raises
- a second classroom for the same `(term_id, section_code)` raises `23505`
- a second classroom membership in one term raises `23505`

**Integration.** Publish → the post appears in a second member's tracker query.
Dismiss → it does not, and the shared row is untouched. Rate limiter returns
`RATE_LIMITED` on the eleventh post in an hour.

**Manual, before Phase 2 merges.** Two accounts, one phone, one desktop: create,
invite, request, approve, post, mark submitted, hide, leave — and confirm the
leaver's marks vanish from the log.

---

## 16. Things that will bite

- **Section codes typed four ways.** Handled by §4, but only if the parser is
  strict and the input is a picker wherever a list already exists.
- **Two students create `BSCS-4B-M` on day one.** The second gets `23505`. It
  must become a join request, in the route, not a constraint violation on
  screen (§6 step 1).
- **The rep who goes quiet.** Without the 60-day claim path, one dormant account
  strands a section for a semester.
- **`display_name` drift.** A student who changes their name in `profiles` must
  update their membership rows too, or the log shows a stale name forever.
- **The composite key in `sync.ts`.** §10. Silent, and it breaks exactly the
  write students make most.
- **`security definer` grants.** Every function here needs `execute` revoked from
  `public` and `anon` and granted to `authenticated`, or definer rights are
  handed to unauthenticated callers.
- **Crimson creep.** The section badge, the submission tick and the member count
  will all be tempting to accent. `--accent` marks the active tab, the primary
  action, and the assistant. Nothing else.
- **The log becoming a scoreboard.** The pull towards "Ana: 9 of 9" is strong
  and it is the one thing §9.4 forbids. Worth re-reading at every review of this
  feature, not only the first.
- **Abuse.** A published post reaches everyone's tracker. Rate limit, dedupe
  index, one-tap hide, and remove-member are the four remedies, and all four are
  in this plan.

---

## 17. Parked

Recorded so they are not rediscovered as surprises. Neither blocks the core.

**Irregular students.** A student taking subjects across two sections genuinely
belongs to both, which `idx_one_classroom_per_student_per_term` forbids. The
sketched answer — different reps each invite them, and the student picks which
subjects they follow in each classroom, so they have two reps — is plausible, and
adds a per-subject filter on top of every query in §7. Not being designed now.
When it is, the migration drops one index and adds a `class_post_subjects`-shaped
filter; nothing here forecloses it.

**Schedule-fingerprint verification.** OneTUP imports every student's timetable
from ERS, and a block section shares an identical one, so
`|fingerprint ∩ canonical| / |canonical|` scores a real classmate near 1.0 and an
outsider near 0. Good idea, not needed on day one: the rep knows their
classmates, and the invite link is already scoped to the group chat. It becomes
worth building if classrooms outgrow a rep's memory for names. Adding
`match_score`, `matched_blocks`, `total_blocks` to `group_join_requests` later is
additive.

**Study groups.** `kind = 'study'` exists in the schema and stays unbuilt.

**Fil localisation.** `profiles.locale` allows `'fil'`, and no module reads it
yet. This feature does not introduce one.
