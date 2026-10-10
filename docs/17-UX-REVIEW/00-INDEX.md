# 17 — UX & Heuristic Review

**Reviewed:** 17 September 2026, against `main` at `8b59fc9`
**Scope:** the whole web app — 44 pages, 89 components, 38,564 lines under
`apps/web/src`, plus the navigation model that ties them together
**Question asked:** is the heuristic good, will a new student be confused, and
is everything a few clicks away?

---

## The verdict in one paragraph

**The navigation model is sound and the click budget is already met** — every
one of the fourteen destinations is at most two taps from anywhere, the sidebar
and the phone bar render from a single list so they cannot disagree, and
twenty-three of the app’s screens carry a real empty state with a real action in
it. What will confuse a new student is not the structure. It is four specific
things: **the phone bar throws away the badge counts the layout already
computes**, **two nav items light up at once on `/subjects/gwa`**, **the word
"Attendance" points at two different screens on the Today screen alone**, and
**a student who skips the ERS import lands on a Today screen whose only useful
button is below six tiles of dashes**. All four are small, local fixes.

---

## Status — what has been acted on

Tier 1 of [Part 05](05-IMPROVEMENTS.md) is built, plus the focus trap from
Tier 2 and the navigation test from "two things worth doing":

| Item | State |
|---|---|
| D-1 · phone bar badges | **Fixed** — bar, More tab roll-up, and the tiles inside the sheet |
| D-2 · double-active matcher | **Fixed**, and pinned by `apps/web/tests/nav-items.test.ts` |
| D-3 · two meanings of "Attendance" | **Fixed** — overview tile renamed **Cuts**; duplicate Commute tile dropped |
| D-4 · false back links | **Fixed** — removed from Grades & GWA and Attendance |
| D-5 · sheet focus | **Fixed** — focus in on open, Tab trapped when modal, restored on close |
| D-6, D-7 · onboarding dead ends | **Fixed** — both now show an error and keep the student in place |
| D-8 · `/campus/tour` orphaned | **Not a defect.** The route is a redirect into `/campus`, kept so old links still work |
| D-9 · no help from inside the app | **Fixed** — a Help group in Settings |
| #4 · hoist the import CTA | **Built** — replaces Up Next, and the overview grid is hidden, until a schedule exists |

Everything else in Part 05 — dark mode, persisting Ask, the sync confirmation,
search, the evaluation card, the filter idiom — is still open.

---

## Part map

| Part | Covers | Read it if you want |
|---|---|---|
| [01 — Navigation & the heuristic](01-NAVIGATION.md) | The nav model, click depth per task, where the grouping holds and where it breaks | The direct answer to "is the heuristic good" |
| [02 — The first run](02-FIRST-RUN.md) | Sign-up → onboarding → first Today screen, and the three dead ends in it | The new-student question |
| [03 — The interfaces](03-INTERFACE.md) | Screen-by-screen review: Today, Ask, Deadlines, Announcements, Settings, the shell | What the UI does well and what it repeats |
| [04 — Confirmed defects](04-DEFECTS.md) | Nine defects with file, line, repro, and fix — verified, not suspected | Something to act on this afternoon |
| [05 — What to build now](05-IMPROVEMENTS.md) | Twelve improvements, ranked by impact over effort | The next two weeks of work |

---

## Health at the time of review

| Signal | State |
|---|---|
| Test suite | 557 tests, 27 files, all passing (22.4s) |
| UI/component tests | **None.** All 27 files test logic, not interfaces |
| Accessibility foundation | 44px targets, skip link, reduced-motion, reduced-transparency, `prefers-contrast` all honoured |
| Dark mode | **Absent.** No `prefers-color-scheme` rule anywhere in 1,348 lines of CSS |
| Global search | **Absent.** No command palette, no cross-screen search |
| In-app help | **Absent.** `/docs` and `/report` are reachable only from the landing footer |
| Orphan routes | One — `/campus/tour` has zero inbound links |

---

## What this review did not cover

- **The worker, the database, and the API routes.** This is a review of what a
  student sees and touches. The 25 route handlers were read only where a screen's
  behaviour depended on one.
- **Copy quality beyond navigation labels.** The landing content and the consent
  copy are taken from the content spec and were not re-litigated.
- **Live production.** Every finding below is read from the tree at `8b59fc9`,
  not from `onetup-app.vercel.app`.
- **Performance.** No bundle analysis, no Lighthouse run.
