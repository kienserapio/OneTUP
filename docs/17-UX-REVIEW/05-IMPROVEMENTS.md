# Part 05 — What to build now

[← Confirmed defects](04-DEFECTS.md) · [Index](00-INDEX.md)

Twelve improvements, ranked by impact over effort. The first tier is an
afternoon. The second is a week. The third is the next version.

---

## Tier 1 — an afternoon, and it removes every confusion in this review

These six are all small, local, and independent of each other.

### 1. Badge the phone bar · *fixes D-1*

Pass `counts` into `<TabBar />`, render them on `TabItem`, and roll the More
sheet's badged destinations up onto the More tab. The numbers are already
queried in the layout; they are simply not handed to the component that needs
them most.

**Why first:** it is the only defect in this review that causes a student to
*miss something*, rather than to be briefly confused.

### 2. Fix the double-active matcher · *fixes D-2*

Four lines in `nav-items.ts`. Also stops two elements claiming
`aria-current="page"` at once.

### 3. Give the Attendance tiles one meaning each · *fixes D-3*

Rename the overview tile to **Cuts** — which is what its number actually counts,
and what a TUP student actually calls it — and drop the duplicated Commute tile
from the overview grid. Today goes from ten tiles to nine, with no collisions.

### 4. Hoist the import CTA when the app is empty

In `today-view.tsx`, when `!data.overview.hasSchedule`: render the "No schedule
yet" card **in place of** the dead `UpNextCard`, and suppress the overview grid.

**Why:** this is the single biggest new-student improvement available. A skipper
currently reads six tiles of dashes before finding the one button that makes the
app work. Six dashes are not information; they are a report that nothing works.

### 5. Guard the two onboarding dead ends · *fixes D-6, D-7*

An error state on the setup step, and an error check on `finishOnboarding()`.
Both files are already importing what they need.

### 6. Add Help and Report to Settings · *fixes D-9*

Two `ListRow`s. `/docs` is 500 lines of genuinely good instruction that no
signed-in student can currently reach.

---

## Tier 2 — a week, and the app starts feeling finished

### 7. Dark mode

**The largest comfort gap in the product.** The token layer already has the
right shape — one `@media (prefers-color-scheme: dark)` block redefining the
palette in `tokens.css`, plus a `theme_color` that follows. The four honoured
media preferences elsewhere show this codebase already thinks this way; this is
the one it skipped.

Peak usage for this app is a phone in bed, checking tomorrow's first class. That
is the moment a white `#f5f4f2` screen is worst.

Add an appearance control to Settings at the same time — System / Light / Dark —
since the setting group is already there and empty of it.

### 8. Trap focus in `Sheet` · *fixes D-5*

One `useEffect`: move focus in on open, remember the trigger, trap Tab, restore
on close. Every sheet in the product gets it at once, including the phone's
primary navigation.

### 9. Persist the Ask conversation

Write `turns` into the existing IndexedDB layer and restore on mount. Ask is the
raised centre button — the control the whole phone bar is arranged around — and
it currently forgets everything the moment a student taps one of the action
links it just offered them.

Two follow-ons once it persists: a short history list, and a "continue where you
left off" line instead of the suggestion chips when there is a prior
conversation.

### 10. Confirm the sync, don't just report the outage

`SyncBoundary` shows a strip while offline and nothing at all when the queue
drains. A student who logged three absences on the LRT deserves a brief *"3
changes synced"* when signal returns. Same component, one more state.

---

## Tier 3 — the next version

### 11. A command palette, and a search that crosses screens

There is no search anywhere in the product — not global, not per-screen. With
fourteen destinations and deep content underneath them (subjects, deadlines,
announcements, study packs, class posts, campus rooms), the only way to find a
specific thing is to remember which screen holds it.

**On desktop:** `⌘K` over destinations, subjects, deadlines and rooms. The nav
list is already a single exported array, so half of it is free.

**On mobile:** a search row at the top of the More sheet — which also solves the
sheet's scrolling problem, because typing two letters beats scrolling past ten
tiles.

Ask OneTUP is adjacent to this but not a substitute: it answers questions, it
does not jump you to a place.

### 12. Surface Faculty eval when the window opens

Faculty evaluation is time-boxed, lives two taps deep in the More sheet, and has
nothing on Today to raise it. When the evaluation period opens, a student should
see a card on Today — the same treatment "Watch your cuts" and the catch-up
prompt already get. The conditional-section pattern on `today-view.tsx` is
exactly this shape; it just has no branch for evaluations.

---

## Two things worth doing that are not features

### Unify the filter idiom

Deadlines filters with toggle-able stat tiles; Announcements filters with
select-one chips. Pick one — the chips are the more conventional and the more
obviously pressable — and if the Deadlines stat tiles stay dual-purpose, give
them `aria-pressed` and a visual affordance that says they can be tapped.

### Put a test around the navigation

557 tests pass and not one of them touches a component. The two highest-value
tests in this whole review are three lines each:

```
- exactly one NAV item matches any given pathname
- every NAV item href resolves to a real route
```

Both of the nav defects in Part 04 would have been caught by the first one.

---

## What this review did not do

- **No code was changed.** This is a read-only review; the tree at `8b59fc9` is
  untouched apart from these five documents.
- **Nothing was verified against production.** Every finding is read from the
  source, not from `onetup-app.vercel.app`.
- **No visual or device testing.** The More-sheet overflow figures in
  [Part 01](01-NAVIGATION.md) are computed from the CSS, not measured on a
  handset. They should be confirmed on a real iPhone SE before that fix is
  scoped.
- **No performance work.** No bundle analysis, no Lighthouse, no runtime
  profiling.
- **The worker, the database, and 25 API routes** were read only where a
  screen's behaviour depended on one.
