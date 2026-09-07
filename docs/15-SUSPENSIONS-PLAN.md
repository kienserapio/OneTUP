# OneTUP — *Walang pasok*

**Status:** plan only. Nothing in this document is built.
**Date:** August 2026
**Depends on:** [04-DATA-MODEL.md](04-DATA-MODEL.md), migration `030`, [12-CLASSROOMS-PLAN.md](12-CLASSROOMS-PLAN.md)

Suspensions are routine here — a typhoon signal, a flood warning, a city-wide
holiday. The app already knows what a cancelled class is; what it does not know
is that one was announced.

---

## 1. The one decision that shapes everything

**A suspension is an advisory. It never cancels a class by itself.**

The reason is specific and it is why this cannot be automated end to end: a
signal-1 announcement suspends *face-to-face* classes, and half the faculty then
move the session online. "No classes today" and "classes are online today" are
both true statements about the same announcement, and only the student and their
professor know which applies to them.

An app that auto-marked those sessions `cancelled` would delete a class that
happened, in the student's own attendance record, on a day they attended it.
That is a wrong number about the thing the product is most careful about.

So: OneTUP tells the student what was announced and offers one tap. It never
decides.

---

## 2. What already exists

| Piece | Where |
|---|---|
| `cancelled` attendance status — excluded from every count, and says "there was nothing to attend" rather than "I was away" | `030_attendance_cancelled.sql` |
| A `suspension` announcement kind | `007`, and `announcements.type` |
| A `suspension` class-post kind, which reaches every classmate's tracker | `032`, `class_posts.kind` |
| Share-sheet intake that turns a pasted message into a structured proposal | `/api/announcements/ingest` |

So the *output* side is built. What is missing is the input: nothing tells the
app that Manila declared a suspension.

---

## 3. Where the announcement comes from

There is no official API. This is worth stating plainly because the search for
one is where the time goes.

| Source | What it is | Usable? |
|---|---|---|
| PAGASA | Tropical cyclone bulletins, wind signals per province and city | No official JSON. Community parsers exist — [bagyo-api](https://github.com/edwardguevarra/bagyo-api) (REST, wind signals, PSGC codes, webhooks) and [pagasa-parser](https://github.com/pagasa-parser) (Node). Both scrape, both break when the bulletin page changes |
| Malacañang | National suspensions | Press releases and social posts. No feed |
| Manila City Hall | The declaration that actually governs TUP Manila | Social posts. No feed |
| TUP itself | The only authority on TUP's own classes | Announcements page and social. No feed |
| Aggregators | [WalangPasok.net](https://walangpasok.net/) and the news trackers | No public feed |

Two conclusions:

1. **A wind signal is mechanical and worth automating.** `bagyo-api` gives a
   signal number for a PSGC location. That is a fact, not a decision, and it is
   the honest thing to surface: *Signal 2 over Manila.*
2. **The suspension declaration itself is human input.** It arrives through the
   path the app already has — a student shares the post, the intake extracts it,
   and it becomes a `suspension` announcement or class post. Do not scrape
   Facebook.

---

## 4. What is missing in the schema

One column and one small table.

### 4.1 Sessions have a delivery mode

The gap that makes the f2f-to-online case unanswerable today: nothing records
how a session was held.

```sql
alter table public.attendance_records
  add column delivery_mode text
    check (delivery_mode in ('f2f','online'));

comment on column public.attendance_records.delivery_mode is
  'How the session was actually held, when it differs from normal. Null means '
  'as scheduled. Set by the student, never inferred: a suspension announcement '
  'is exactly as likely to move a class online as to call it off.';
```

Present-online is a present. It changes no count. What it buys is a student
reconstructing a term two months later being able to see why a week looks odd —
the same reason `cancelled` was worth adding in `030`.

### 4.2 Advisories

```sql
create table public.suspension_advisories (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('national','ncr','city','university')),
  city          text,
  effective_on  date not null,
  level         text check (level in ('signal_1','signal_2','signal_3','signal_4','signal_5','flood','holiday','other')),
  headline      text not null check (char_length(headline) between 1 and 200),
  source_url    text,
  source        text not null check (source in ('pagasa','lgu','university','student')),
  created_at    timestamptz not null default now(),
  unique (scope, city, effective_on, level)
);
```

Read-only reference: everyone reads, only the service role writes. No student
data, so nothing here needs a per-user policy.

---

## 5. What a student sees

A card on Today, on the day it applies, and nowhere else:

```
┌──────────────────────────────────────────────┐
│ ⚠  Manila suspended classes today            │
│    Signal 2 · from PAGASA, 5:40 AM           │
│                                              │
│    [ My classes were cancelled ]             │
│    [ They moved online ]        [ Dismiss ]  │
└──────────────────────────────────────────────┘
```

- **My classes were cancelled** writes `cancelled` for today's remaining
  sessions. One tap, undoable, exactly the existing attendance write path.
- **They moved online** writes `present` with `delivery_mode = 'online'` for the
  ones the student attended — and it does not guess which those were, it prompts
  per class the way `attendance-prompt.tsx` already does.
- **Dismiss** does nothing to any record. It is a notice.

The tone matters: this is a **notice**, not an alert. `--warning`, never
`--danger`, and never `--accent`.

---

## 6. Where it fans out

A suspension is the one announcement worth pushing outside quiet hours —
`12-CLASSROOMS-PLAN.md` §13 already reserves `class_suspension` for
`ALWAYS_DELIVER`, next to `wake_alarm`. That is correct and it is why this
feature is written down beside the classroom one: a rep posting *no classes
Friday* to their classroom is the same event arriving by the human path, and it
should reach the same card.

Both paths, one card:

- **Advisory** → the banner on Today, from `suspension_advisories`.
- **Class post** of kind `suspension` → already reaches every member's tracker.

Neither writes attendance. Both offer the same two taps.

---

## 7. Build order

### Phase 1 — The card, with no automatic source (~2 days)

- [ ] `suspension_advisories`, RLS, grants
- [ ] `delivery_mode` on `attendance_records`
- [ ] The Today card, with both actions and dismiss
- [ ] Seed one advisory by hand and confirm the taps write what they should

Useful on its own: a rep or an admin can enter an advisory, and every student
sees it.

### Phase 2 — Wind signals (~2 days)

- [ ] A scheduled job polls `bagyo-api` for Manila's PSGC code
- [ ] A signal at or above 1 writes an advisory with `source = 'pagasa'`
- [ ] The card says *Signal 2 over Manila* — a fact — and never *classes are
      suspended*, which is a decision PAGASA does not make

### Phase 3 — The human path (~2 days)

- [ ] The share intake proposes an advisory when it extracts a suspension
- [ ] A classroom post of kind `suspension` surfaces in the same card
- [ ] Push, once the dispatch scheduler exists (`12-CLASSROOMS-PLAN.md` §13)

---

## 8. Things that will bite

- **Auto-cancelling.** §1. The whole feature is one decision, and this is it.
- **A signal number read as a suspension.** PAGASA raises signals; mayors
  suspend classes. Rendering one as the other is wrong on the days it matters.
- **A national announcement applied to Taguig.** `scope` and `city` exist for
  this; a student's campus is on their profile.
- **Yesterday's advisory still on screen.** `effective_on` is a date and the
  card is for that date only.
- **A card that cries wolf.** One a day, at most, and a dismissed one stays
  dismissed. An advisory that appears every morning of the rainy season is one
  nobody reads on the morning it matters.
- **Scraping social media.** Do not. The intake path exists, students already
  use it, and it produces a submission with a person behind it.
