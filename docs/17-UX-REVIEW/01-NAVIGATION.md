# Part 01 — Navigation & the heuristic

[← Index](00-INDEX.md) · [Next: the first run →](02-FIRST-RUN.md)

---

## The short answer

**The heuristic is good.** It is better than most apps this size ship with, and
the reasoning behind it is written down in the code rather than left implicit.
Three decisions in `apps/web/src/components/app/nav-items.ts` are the reason:

1. **One list, two renderings.** `NAV_GROUPS` is the single source. The sidebar
   and the phone bar both read it, so they cannot disagree about what exists or
   what is selected. Most apps grow a second, drifting nav for mobile; this one
   structurally cannot.
2. **Grouping by *when you reach for it*, not by module.** Daily / Academics /
   More is a student's own mental model. "Schedule, Deadlines, Announcements"
   sit together because they are all opened on a Tuesday morning — not because
   they share a database table.
3. **Labels that name their contents.** "Grades & GWA", not "Academics".
   "Faculty eval", not "Feedback". A specific label is what makes a destination
   predictable before you tap it, and this list is disciplined about it.

The phone-bar decision is also right, and the code argues for it correctly: four
destinations plus a **More** sheet, rather than nine crammed tabs. The comment
on `PHONE_NAV` records that an earlier cut left six destinations reachable only
from a sidebar phones never see. That was the real bug, and it is fixed.

---

## Click depth — the "few clicks away" test

Measured on a phone, from a cold open of the installed PWA (`start_url` is
`/today`, so Today costs zero taps).

| Task | Taps | Path |
|---|---|---|
| See my next class | **0** | Today is the start screen |
| See today's remaining classes | **0** | Same screen, "Rest of your day" |
| Add a deadline | **2** | Today → *Deadline* tile → form |
| Log attendance | **2** | Today → *Attendance* tile → form |
| Check what's due | **1** | Deadlines tab |
| Ask a question | **1** | The raised centre button |
| Check GWA | **1** | Today → *Grades & GWA* overview tile |
| Open a subject | **2** | More → Subjects → row |
| Start a study review | **3** | More → Study → *Review* |
| Join a classroom | **3** | More → Classroom → *Join* |
| Submit a faculty eval | **3** | More → Faculty eval → row |
| Change a setting | **2** | More → Settings |

**Every destination is reachable in one or two taps. No task in the app takes
more than three.** The stated goal — everything a few clicks away — is met.

The desktop side is flatter still: all fourteen destinations are one click from
the always-visible rail.

---

## Where the heuristic breaks

Four places. None is structural; all four are local.

### 1. The phone bar drops the badges it was given

`apps/web/src/app/(app)/layout.tsx:58` computes two counts — deadlines due
within 48 hours, and announcements from the last three days — and hands them to
`<Sidebar counts={…} />`. Line 68 renders `<TabBar />` with **no props at all**.
`TabItem` (`tab-bar.tsx:103`) renders an icon and a label and nothing else.

The consequence, on the device the product was built for:

- A deadline due in six hours produces **no visible signal** on the phone bar.
- A new announcement produces **no visible signal anywhere on a phone** —
  Announcements lives inside the More sheet, and the sheet has no badge either.

The counts are already queried, already in memory, already passed down one
branch of the tree. The desktop rail — the surface a student uses least — is the
only one that shows them.

**This is the single highest-impact navigation defect in the app.**

### 2. Two nav items light up at once

`/subjects` matches with `startsWith('/subjects')`, so it also matches
`/subjects/gwa` and `/subjects/catch-up`, which are themselves top-level nav
items. Verified:

```
/subjects            ok            -> /subjects
/subjects/gwa        DOUBLE-ACTIVE -> /subjects + /subjects/gwa
/subjects/catch-up   DOUBLE-ACTIVE -> /subjects + /subjects/catch-up
/subjects/gwa/import ok            -> /subjects          (not Grades & GWA)
```

Two sidebar rows render in accent, and — worse — two links emit
`aria-current="page"` simultaneously. A screen reader announces two current
pages. `titleFor()` is unaffected because it sorts longest-href-first, so the
top bar says the right thing while the rail says two things.

### 3. "Attendance" means two different screens on one screen

On Today alone:

| Where | Label | Destination |
|---|---|---|
| Quick action tile (`today-view.tsx:278`) | Attendance | `/subjects/catch-up` |
| Overview tile (`today-view.tsx:339`) | Attendance | `/subjects` |
| Sidebar / More sheet (`nav-items.ts:88`) | Attendance | `/subjects/catch-up` |

Two tiles, same word, same screen, different places. A student who learns the
quick action has learned the wrong thing about the overview tile. **Commute** is
duplicated the same way (`:280` and `:378`) — same destination at least, but it
still occupies two slots in a screen whose whole argument is economy.

### 4. "More" contains a group called "More"

`NAV_GROUPS[2].label` is `'More'`. The phone tab is labelled **More**. The sheet
it opens is titled **"Everything else"**. So: tap *More* → a sheet called
*Everything else* → whose third section is called *More*. Three different names
for two levels of the same idea.

---

## A sizing problem in the More sheet

The sheet is capped at `max-h-[88dvh]` (`sheet.tsx:101`) and holds ten
destinations in a two-column grid, three group headers, and a sign-out row —
roughly 700px of content.

| Device | Available at 88dvh | Result |
|---|---|---|
| iPhone SE (667pt) | ~587px | **Scrolls.** Campus, Settings and Sign out fall below the fold |
| iPhone 15 (852pt) | ~750px | Fits, barely |

Settings being below the fold in the sheet that *is* the phone's navigation is
worth fixing — see [Part 05](05-IMPROVEMENTS.md).

---

## What is genuinely well done here

Worth stating plainly, because the defects above are all small and the
foundations are not:

- **`titleFor()` sorts longest-prefix-first.** That is the correct algorithm and
  most codebases get it wrong.
- **The badge comment on Classroom** — a class post with a due date is already
  counted by Deadlines, so Classroom deliberately carries no badge. Double-
  counting the same work under two numbers is exactly the bug this avoids, and
  somebody thought about it.
- **`MoreTab` is a `<button>`, not a `<Link>`.** It opens something rather than
  going somewhere, and it says so with `aria-haspopup="dialog"` and
  `aria-expanded`. That distinction is usually lost.
- **The sheet closes on navigation** (`useEffect(() => setMore(false), [pathname])`).
  An obvious thing that is very often missed.
- **Back links are consistent.** Seventeen of the app's detail screens pass an
  explicit `back={{ href, label }}` to `NavBar` rather than relying on
  `router.back()`. In a `display: standalone` PWA with no browser chrome, that
  is the difference between a usable app and a trap.

One caveat on that last point: `/subjects/gwa` and `/subjects/catch-up` are
**top-level nav destinations that render a "‹ Subjects" back link**. A student
who reached Grades & GWA from the sidebar is offered a back button to a place
they did not come from. See [Part 04](04-DEFECTS.md), defect D-4.
