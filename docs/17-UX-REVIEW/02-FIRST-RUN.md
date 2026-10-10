# Part 02 — The first run

[← Navigation](01-NAVIGATION.md) · [Index](00-INDEX.md) · [Next: the interfaces →](03-INTERFACE.md)

---

## The path a new student walks

```
/  →  /sign-up  →  /welcome  →  consent → connect → review → [grades] → setup → install  →  /today
```

Five or six steps, a segmented progress bar, and three genuine escape hatches at
the first step. The flow is well built. What follows are the three places it
leaves a student stranded, and one framing problem that costs conversions.

---

## The framing problem: the app opens with a risk disclosure

The first screen after sign-up is titled **"About your ERS password"**. It is
five bullet points about credential handling, a card that says *"your password
does pass through our server… it isn't zero risk"*, and three buttons.

The honesty is the right call and should not change — `07-AUTH-ERS.md` §3 is
correct that a request you cannot refuse is a toll, not a choice, and the
residual-risk sentence belongs on screen rather than buried.

**But it is the wrong first screen.** A student who has just typed an email
address has not yet been told what OneTUP does. They are being asked to weigh a
security trade-off for a benefit nobody has named. The consent copy answers
*"what will you do with my password?"* before anything has answered *"why would
I give it to you?"*

The value is already written, in `08-LANDING-CONTENT.md` and on the landing page
itself — but a student who arrived from a group-chat link and tapped Sign up may
never have read it.

**The fix is one screen, not a redesign:** a single "Here's what you get" step
ahead of consent — the six things OneTUP will track, in six lines, with the
class card as the illustration — and then the consent screen exactly as written.
Cost: one component. It moves the disclosure from *the ask* to *the terms of
the ask*, which is where it reads as trustworthy rather than alarming.

---

## Dead end 1 — "Skip for now" lands on an empty room

`onboarding.tsx:112` — `onSkip={() => setStep('setup')}`. The student jumps
consent → setup → install → `/today`.

The app shell's own comment (`layout.tsx`) states the principle:

> *A student who signed up but never finished onboarding lands in the onboarding
> flow rather than on an empty Today screen: an app with nothing in it reads as
> broken, not as new.*

The skip path produces precisely the screen that comment is trying to prevent.
Here is what a skipper actually sees, top to bottom:

| Position | What renders |
|---|---|
| 1 | "Magandang umaga" — no name if ERS never ran |
| 2 | "No classes left today." |
| 3 | A flat grey card: **"Nothing scheduled for the rest of the week."** — this is the hero surface, the one saturated crimson card the whole screen is built around, rendered as nothing |
| 4 | Four quick-action tiles, three of which lead to screens that are also empty |
| 5–9 | *(all the conditional sections render nothing)* |
| 10 | Six overview tiles reading `—`, `0`, `0`, `0`, `0`, `—` |
| 11 | **"No schedule yet. Import it from ERS, or paste it in."** — with the only button that matters |

**The one useful control on the screen is eleventh, below a wall of zeroes.**
The empty state is written and it is good; it is simply in the wrong place when
the app is brand new.

**Fix:** when `!data.overview.hasSchedule`, hoist that card to the top — in
place of the dead `UpNextCard` — and suppress the overview grid entirely. Six
tiles of dashes are not information; they are a report that nothing works.

---

## Dead end 2 — the setup step can fail silently forever

`onboarding.tsx:543`:

```ts
const userId = data.user?.id
if (!userId) {
  setBusy(false)
  return
}
```

If the session has lapsed by the time a student reaches step 5, the **Continue**
button spins, stops, and does nothing. No error, no progression, no explanation.
The only recovery is a page refresh, which restarts onboarding from step 1.

Two lines of error state fix it. The same screen's `FormError` component is
already imported into the file.

---

## Dead end 3 — the last step can loop the whole flow

`onboarding.tsx:183` and `:728`:

```ts
await finishOnboarding()   // updates profiles.onboarded_at — return value discarded
router.push('/today')
```

`finishOnboarding()` swallows its result. If the update fails — a lapsed token,
a transient network error, an RLS surprise — the push to `/today` happens
anyway, the app layout reads `!profile.onboarded_at`, and redirects straight
back to `/welcome`.

The student re-enters onboarding at step 1, with their schedule already
committed. They will import it a second time. On a slow connection this is not a
hypothetical: it is the failure mode of the single most important write in the
product, and it is unguarded.

**Fix:** check the error, and on failure hold the student on the install step
with a retry rather than pushing them into a loop.

---

## What the onboarding gets right

- **Credentials never touch a store.** Component state only, cleared on both the
  success and the failure path (`:401–405`), documented at the top of the file.
  This is the hard thing and it is done correctly.
- **One sign-in, two confirmations.** Asking for the ERS password twice would
  spend the expensive moment twice, and the portal kills the first session
  anyway. Reading both pages from one login and confirming them in two passes is
  the right shape, and the reasoning is recorded.
- **The progress bar grows honestly.** `ORDER` vs `ORDER_WITH_GRADES` — when ERS
  returns past grades there genuinely is one more thing to confirm, and the bar
  adds a segment rather than lying about how far along the student is.
- **`setGrades(null)` on the paste path** (`:136`). A paste is a schedule and
  only a schedule; grades left over from an abandoned ERS attempt would
  otherwise resurface two steps later as data that import never read. Subtle,
  and caught.
- **The install step is platform-aware and explains *why*.** On iOS, Web Push
  only works from a home-screen install — said at the moment it is relevant
  rather than discovered later as a bug report.
- **Three ways out of the consent screen**, all visible, none disguised.

---

## The empty states elsewhere are a genuine strength

Twenty-three screens render an `EmptyState`, and almost all of them carry an
action rather than a shrug:

| Screen | Empty copy carries |
|---|---|
| Subjects | → Import your schedule |
| Study | → Make a pack |
| Deadlines | → Add one |
| Announcements | → Share something |
| Classroom | → Join, or start one |
| Grades & GWA | → Import from ERS, *or* enter by hand |
| Commute | → Pick where you commute from |

Three of these are notably good. **Commute** tells a student whose area has no
routes to *try a neighbouring area, because routes are shared* — an empty state
that teaches the data model. **Announcements** explains the mechanism (*"when
your class representative posts something, share it here"*) rather than just
reporting absence. **Campus** degrades honestly: *"the 3D campus isn't connected
yet — room lookup, the place list and the emergency numbers all still work
below."*

That is a high standard, consistently applied. The Today screen is the one place
it is not — see Dead end 1 above.
