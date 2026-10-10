# Part 03 — The interfaces

[← The first run](02-FIRST-RUN.md) · [Index](00-INDEX.md) · [Next: confirmed defects →](04-DEFECTS.md)

---

## The design system

Five primitive files — `button`, `icon`, `mark`, `sheet`, `surfaces` — carrying
89 components and 44 screens. That is unusually lean and it shows: the app looks
like one product rather than a federation of screens.

The token layer is serious work. 1,348 lines of CSS across
`tokens / typography / materials / globals`, and it honours four user
preferences that most products ignore entirely:

| Preference | Honoured at |
|---|---|
| `prefers-reduced-motion` | `tokens.css:200`, `materials.css:518`, `globals.css:254` |
| `prefers-reduced-transparency` | `tokens.css:224` |
| `prefers-contrast: more` | `tokens.css:238`, `materials.css:217` |
| `hover: hover and pointer: fine` | `materials.css:135`, `:506` — hover effects don't fire on touch |

`--target-min: 44px` is defined once and applied at seven call sites. A skip
link exists and is correctly `sr-only` until focused.

**The one thing missing from an otherwise complete system is dark mode.** There
is no `prefers-color-scheme` rule anywhere in those 1,348 lines, and the
manifest hard-codes `#f5f4f2` for both `background_color` and `theme_color`. For
an app whose peak usage is a phone at night — checking tomorrow's first class
before sleeping — that is the largest single comfort gap in the product.

---

## Today

**This is the best screen in the app.** The ordering is an argument and the
argument is right: where you have to be → what you owe an answer to → what is
about to be due → everything else. The comment states the success case as *a
student who opens this, sees what they need, and closes it in eight seconds*,
and the layout actually serves that.

Specific things that work:

- **`summarise()` names what is different about today** — "3 classes left, 2
  things due within 48 hours, 1 subject near the absence limit." Not
  encouragement. Information.
- **One saturated surface, and only one.** `UpNextCard` is the sole crimson
  gradient; everything below is white. That single decision is what makes the
  screen legible at a glance.
- **The card answers "and then?"** without a tap — it finds the following block
  and shows it.
- **The `hasSchedule` fix is recorded in a comment.** The old test was
  `data.blocks.length === 0`, which meant every Sunday a fully-imported student
  was told they had no schedule. Someone found that and wrote down why.
- **Filipino greeting by time of day.** Both languages first-class, not a
  toggle.

### What Today repeats

Three navigation systems are stacked on one screen: the quick-action tiles
(four), the overview tiles (six), and the app nav itself. Of the four quick
actions, **two are duplicated in the overview grid** — Attendance and Commute —
and one of those duplications points somewhere different (see
[Part 01](01-NAVIGATION.md), break #3).

The `QuickActions` comment argues for *four, not six, and one word each*. The
argument is sound. It just was not applied to the overview grid below it, so the
screen ends up with ten tiles where the reasoning called for four.

### The zero-state problem

Covered in [Part 02](02-FIRST-RUN.md). Restated because it belongs here: when
`hasSchedule` is false, the overview grid renders `— 0 0 0 0 —` and the import
CTA sits underneath it. The screen's own ordering principle is violated by its
only empty case.

---

## Ask OneTUP

The concept is right and the implementation of the hard part is right. The
distinction from ADR-007 is made *visible*: arithmetic arrives unlabelled
because it is arithmetic, and only genuinely generated text carries the
`GeneratedMark`. Labelling everything would make the label mean nothing, and the
code says so.

Three good touches:

- **Receipts.** Each answer can carry `{ template, read }` — which lookup ran
  and what it read. That is how a student learns to trust the number.
- **Actions.** Answers carry `{ label, href }` pointers. *"A pointer with no link
  is half an answer."*
- **The offline message is specific:** *"You're offline, so I can't look
  anything up. Your schedule, cuts and deadlines are still all there."* It tells
  the student what still works.

### The gap: nothing persists

`const [turns, setTurns] = useState<Turn[]>([])`. Navigate away, or refresh, and
the conversation is gone — including the receipts and the action links the
student was about to tap.

This matters more here than it would elsewhere, because **Ask is the raised
centre button**, the one saturated control on the phone bar, positioned as the
thing you come back to. A student who taps an action link in an answer and then
returns finds an empty screen. The suggestion chips reappear as if they had
never asked anything.

The offline layer already exists (`lib/offline/db`). Persisting the last
conversation into it is a small change with a large effect on whether Ask feels
like a place or a vending machine.

---

## Deadlines and Announcements — two filter idioms

Both screens filter. They do it in two unrelated ways.

| | Deadlines | Announcements |
|---|---|---|
| Control | Three large stat tiles in a grid | A row of pill chips |
| Semantics | Toggle — tapping an active filter clears it | Select-one, with an explicit "All" chip |
| Affordance | The tile is *both* the readout and the control | Chip reads as a control |
| ARIA | `role="group"` | `role="group"` |

Neither is wrong on its own. Together they mean a student learns a filtering
gesture on one screen that does not transfer to the other.

The Deadlines version carries the extra risk: **a stat tile that is also a
button is a well-known discoverability failure.** Students read a number in a
card as a readout and do not try tapping it. The count is genuinely useful there
— the dual purpose is the elegant part — but nothing in the tile's styling says
"pressable," and there is no `aria-pressed` to tell assistive tech either.

Announcements also has a second, quieter filter — "Show finished" on Deadlines
is a plain text button sitting outside the grid, a third interaction shape on a
screen that already has two.

---

## The shell

**Sidebar (≥900px)** — 244px rail, fourteen destinations in three groups,
badges, and a profile footer that doubles as the Settings link. Clean. The
breakpoint choice is documented.

**Topbar** — deliberately thin: title, date, and two actions. The comment is
right that *a bar that grows becomes a second navigation the student has to
learn*. The date is formatted in `Asia/Manila` explicitly, which is correct for
a student body that is entirely in one timezone.

**TabBar (<900px)** — floating rather than filling the bottom strip, so content
scrolls visibly underneath and the glass has something to refract. The raised
Ask button in the one saturated colour the product owns. This is a
well-considered piece of work, undermined by the missing badges.

**SyncBoundary** — offline is a first-class state, not an error state. The strip
reports the queue depth (*"3 changes will sync when you're back"*) and never
blocks anything. Threshold evaluation runs on-device because no server process
is allowed to read a student's grades, and the comment says so.

One asymmetry: **there is no indicator for the online-with-pending-writes
state.** A student who edited three things on the LRT and then got signal has no
confirmation that those three things landed. The strip vanishes the moment
`online` flips true, whether or not the queue drained.

---

## Settings

Well-structured — Profile, Getting to campus, Attendance, Reminders, Your data —
and the destructive action is properly gated behind typing `DELETE`. Export is
one JSON file with *"every row we hold about you"*, and Privacy is linked inline.

Three things are missing from it:

1. **No "Report a problem."** `/report` exists and is linked only from the
   landing-page footer and the contributors page. A signed-in student — the only
   person who can actually hit a bug — has no route to it.
2. **No "How this works."** `/docs` is 500+ lines written as instructions rather
   than a feature tour, and it is likewise reachable only from the marketing
   footer. It is the in-app help this app does not have.
3. **No appearance control**, because there is no dark mode to control.

---

## Accessibility: the one real defect

The foundation is strong — skip link, 44px targets, `aria-current`,
`aria-haspopup`, `role="status"` on the offline strip, `aria-busy` on skeletons,
four honoured media preferences.

The `Sheet` component breaks the pattern. It sets `role="dialog"` and
`aria-modal`, handles Escape, and locks body scroll — but **it has no focus trap
and no focus restore.** `panelRef` exists and is used only for measuring height.

`aria-modal="true"` is a promise that everything behind the dialog is inert. It
is not. A keyboard or screen-reader user can Tab straight out of the open sheet
into the page underneath the scrim, with no visible indication of where they
are, and on close, focus is on `<body>` rather than back on the trigger.

This matters more than it would in most apps, because **the More sheet is the
phone's primary navigation.** Every sheet in the product inherits the same gap:
the grade sheet, the threshold sheet, the limits sheet, the what-if planner.

---

## Smaller notes

- **`IconClassroom` is the one outline glyph in a set of filled ones.** The
  comment explains why (Tabler ships no filled users-group), but in a row of
  solid icons an outline reads as disabled.
- **`IconToday` is `IconClockFilled`**, and `IconClock` is used separately for
  time chips inside `UpNextCard`. The home destination shares its glyph with a
  generic time marker.
- **`IconStudy` is assigned to Faculty eval, and `IconCards` to Study.** The
  drawing is right — mortarboard for evaluation, cards for the review deck — but
  the variable named `IconStudy` not being on the Study item is a trap for the
  next person editing this list.
- **`/campus/tour` has zero inbound links.** The landing page comment says the
  tour "now has its own page, reachable from the navigation from anywhere on the
  site." The site nav links `/campus` instead. The route is dead.
- **Faculty eval has no seasonal surface.** It is time-boxed — it opens near the
  end of term — and lives two taps deep in the More sheet with nothing on Today
  to raise it when the window opens. A student will simply forget it exists.
