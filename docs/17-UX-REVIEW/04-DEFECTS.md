# Part 04 — Confirmed defects

[← The interfaces](03-INTERFACE.md) · [Index](00-INDEX.md) · [Next: what to build now →](05-IMPROVEMENTS.md)

Nine defects. Every one was verified by reading the code at `8b59fc9`, and the
two that could be tested mechanically were. Ranked by what they cost a student.

---

## D-1 · The phone bar shows no badge counts

**Severity:** high · **Effort:** small
**Where:** `apps/web/src/app/(app)/layout.tsx:58`, `:68` ·
`apps/web/src/components/app/tab-bar.tsx:103`

The layout queries two counts and passes them to `<Sidebar counts={…} />`.
`<TabBar />` is rendered with no props. `TabItem` has no badge branch. The
`NavItem.badge` field is declared in `nav-items.ts:39` and read only by the
sidebar.

**What it costs:** on a phone, a deadline due in six hours produces no signal on
the bar, and a new announcement produces no signal anywhere at all —
Announcements sits inside the More sheet, which has no badge either. The only
place these numbers surface on mobile is the overview grid at the bottom of
Today.

**Fix:** pass `counts` into `TabBar`, render a dot or count on `TabItem` when
`item.badge` is set, and roll up the counts for destinations inside the sheet
onto the More tab itself.

---

## D-2 · Two nav items are active at once on `/subjects/gwa`

**Severity:** high · **Effort:** trivial
**Where:** `apps/web/src/components/app/nav-items.ts:86–88`

`/subjects` matches `startsWith('/subjects')`, which also matches its two
sibling nav destinations. Verified:

```
/subjects            ok            -> /subjects
/subjects/gwa        DOUBLE-ACTIVE -> /subjects + /subjects/gwa
/subjects/catch-up   DOUBLE-ACTIVE -> /subjects + /subjects/catch-up
/subjects/gwa/import ok            -> /subjects          (should be Grades & GWA)
```

**What it costs:** two accent-coloured rows in the sidebar, and two elements
emitting `aria-current="page"` — a screen reader announces two current pages.

**Fix:** exclude the siblings from the parent's matcher.

```ts
const SUBJECT_CHILDREN = ['/subjects/gwa', '/subjects/catch-up']

{
  href: '/subjects',
  label: 'Subjects',
  Icon: IconSubjects,
  match: (p) => p.startsWith('/subjects') && !SUBJECT_CHILDREN.some((c) => p.startsWith(c)),
}
```

Widening the children to `startsWith` at the same time fixes
`/subjects/gwa/import` highlighting the wrong item.

---

## D-3 · "Attendance" points at two different screens on the Today screen

**Severity:** high · **Effort:** trivial
**Where:** `apps/web/src/components/today/today-view.tsx:278` and `:339–340`

| Tile | Label | Destination |
|---|---|---|
| Quick action | Attendance | `/subjects/catch-up` |
| Overview | Attendance | `/subjects` |

Same word, same screen, different places. The nav uses the quick action's
meaning (`nav-items.ts:88`), so the overview tile is the odd one out.

**What it costs:** a student learns the label on one tile and is taken somewhere
else by the other. Nielsen heuristic 4, consistency and standards, on a single
viewport.

**Fix:** point the overview tile at `/subjects/catch-up` too, or rename it — the
number it displays is `cutWarnings`, so **"Cuts"** or **"Absences"** is both more
accurate and unambiguous. Commute is duplicated the same way at `:280` / `:378`;
dropping it from one of the two grids is the right call.

---

## D-4 · Top-level destinations render a back link to somewhere you were not

**Severity:** medium · **Effort:** trivial
**Where:** `apps/web/src/components/subjects/gwa-view.tsx`,
`apps/web/src/components/subjects/catch-up-view.tsx`

Both screens are **top-level nav items** and both pass
`back={{ href: '/subjects', label: 'Subjects' }}` to `NavBar`.

**What it costs:** a student who tapped *Grades & GWA* in the sidebar or the
More sheet is offered "‹ Subjects" — a back button to a screen they did not come
from. Combined with D-2, `/subjects/gwa` is the most confused route in the app:
it highlights two nav items and offers a false history.

**Fix:** render `back` only when the referrer warrants it, or drop it from these
two now that both are first-class destinations.

---

## D-5 · Sheets claim modality they do not enforce

**Severity:** medium · **Effort:** small
**Where:** `apps/web/src/components/ui/sheet.tsx:50`, `:95–96`

`role="dialog"` and `aria-modal` are set. Escape is handled, body scroll is
locked. There is **no focus trap and no focus restore** — `panelRef` is used
only to measure height for the drag transform.

**What it costs:** `aria-modal="true"` asserts that content behind the dialog is
inert. It is not. Keyboard and screen-reader users Tab out of the sheet into the
page under the scrim with no indication of where they went, and on close focus
falls to `<body>` rather than the trigger. Every sheet in the product inherits
this, including the More sheet that *is* the phone's navigation.

**Fix:** on open, move focus into the panel and remember the previously focused
element; trap Tab within the panel; restore focus on close.

---

## D-6 · The setup step can fail silently and strand the student

**Severity:** medium · **Effort:** trivial
**Where:** `apps/web/src/components/auth/onboarding.tsx:543`

```ts
const userId = data.user?.id
if (!userId) {
  setBusy(false)
  return
}
```

**What it costs:** if the session has lapsed by step 5, **Continue** spins,
stops, and does nothing. No message. The only recovery is a refresh, which
restarts onboarding from step 1.

**Fix:** set an error. `FormError` is already imported in this file.

---

## D-7 · The final onboarding write can loop the whole flow

**Severity:** medium · **Effort:** small
**Where:** `apps/web/src/components/auth/onboarding.tsx:183`, `:728`

`finishOnboarding()` performs the `profiles.onboarded_at` update and discards
the result. `router.push('/today')` runs regardless.

**What it costs:** if that write fails, the app layout reads
`!profile.onboarded_at` and redirects to `/welcome`. The student restarts
onboarding at step 1 with a schedule already committed, and will import it
twice. This is the failure mode of the most important write in the product, and
nothing guards it.

**Fix:** return the error, and on failure keep the student on the install step
with a retry instead of pushing them into the redirect.

---

## D-8 · `/campus/tour` is orphaned

**Severity:** low · **Effort:** trivial
**Where:** `apps/web/src/app/campus/tour/page.tsx`

Zero inbound links in the entire tree. The comment in `apps/web/src/app/page.tsx:16`
states the tour "now has its own page, reachable from the navigation from
anywhere on the site"; `site-nav.tsx:186` and `:260` link `/campus`.

**Fix:** link it from `/campus`, or delete the route and correct the comment.

---

## D-9 · No route to help or bug reporting from inside the app

**Severity:** low · **Effort:** trivial
**Where:** `apps/web/src/components/settings/settings-view.tsx:363–375`

`/report` is linked from `site-footer.tsx` and `contributors/page.tsx`. `/docs`
is linked from `site-footer.tsx` and `site-nav.tsx`. Neither is reachable from
any authenticated screen.

**What it costs:** the only people who can hit a bug are signed in, and they
have no way to say so without leaving the app for the marketing site.

**Fix:** two `ListRow`s in the "Your data" group of Settings, or a new "Help"
group above it.

---

## Not defects, but worth a decision

| Observation | Where |
|---|---|
| The More sheet scrolls on an iPhone SE — Settings and Sign out fall below the fold | `sheet.tsx:101`, `tab-bar.tsx` |
| A group labelled "More" lives inside a sheet called "Everything else" opened by a tab called "More" | `nav-items.ts:94` |
| No sync confirmation when the queue drains after coming back online | `sync-boundary.tsx` |
| Ask conversations are not persisted across navigation | `ask-view.tsx:48` |
| No dark mode anywhere in 1,348 lines of CSS | `design/*.css` |
| Deadlines and Announcements use two unrelated filter idioms | `deadlines-view.tsx:261`, `announcements-view.tsx:283` |
| No UI or accessibility tests among 557 passing tests | `apps/web/tests` |
