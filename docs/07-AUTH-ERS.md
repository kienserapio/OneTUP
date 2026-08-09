# OneTUP — Authentication & ERS Integration

**Version 1.0 · August 2026**

This document specifies sign-up, sign-in, and schedule import. It is the most security-sensitive component in the product and the one where a design shortcut would cause the most harm.

---

## 1. The requirement and the constraint

**Requirement.** Onboarding should be one step. A student signs up and their schedule is already there. No copying, no pasting, no second visit.

**Constraint.** That requires their ERS credentials. ERS is not a low-value account — it holds enrollment records, personal details, and academic history. A database of working ERS credentials would be one of the most damaging things a student project could accidentally create.

**Resolution.** Credentials are accepted, used once, and discarded. They are never written to any server-side persistent store. The student gets the one-step onboarding; we never hold the keys.

### 1.1 What this design does and does not protect against

**Eliminated:** a breach of OneTUP's database yielding working ERS credentials. There is nothing to steal, because nothing is stored.

**Reduced:** credentials exist in worker process memory for the duration of one scrape, in an isolated container with no database access and no persistent volume.

**Remaining, and disclosed to the student:** credentials transit OneTUP's infrastructure over TLS and exist transiently in memory. A sufficiently deep compromise of the running worker at the moment of a scrape could capture them. This is the residual risk, it is real, and the student is told about it before they type anything.

**The honest framing shown to students:** OneTUP never saves your ERS password. It is used once to read your schedule and then discarded. If you would rather not enter it at all, you can paste your schedule instead.

---

## 2. Two-identity model

OneTUP maintains an identity separate from ERS.

| | OneTUP account | ERS credentials |
|---|---|---|
| Purpose | Sign in to OneTUP | Read the schedule from the portal |
| Password | Set by the student, OneTUP-specific | The student's existing ERS password |
| Stored | Yes — hashed by Supabase Auth | **Never, server-side** |
| Used | Every session | Only during import or re-sync |

### 2.1 Why not use ERS credentials as the OneTUP login

Tempting, because it collapses two steps into one. Rejected for three reasons:

1. It would require storing or repeatedly transmitting the ERS password for every sign-in, not just for import — multiplying exposure by every session.
2. Password reuse becomes structural: an ERS password change silently breaks OneTUP sign-in, and a OneTUP compromise implies an ERS compromise.
3. It makes OneTUP a credential-verification oracle for ERS. Anyone could test stolen credentials against our sign-in endpoint.

The student sets a OneTUP password. It is theirs, it is separate, and it is the only one we hold.

---

## 3. Sign-up flow

```
Step 1  Account            email + OneTUP password + student number
Step 2  Consent            explain exactly what happens to ERS credentials
Step 3  Connect ERS        student number (prefilled) + ERS password + birthdate
Step 4  Import             worker fetches, parses, returns; nothing committed
Step 5  Review             every field editable; student confirms
Step 6  Setup              home area, route, preparation time, thresholds
Step 7  Install            prompt to add to home screen; explain why
```

Steps 3 and 4 are skippable. A student may complete sign-up and use paste import, manual entry, or nothing at all. **The product must be usable without ever supplying ERS credentials.** This is a hard requirement, not a courtesy — it is what makes the credential request a genuine choice.

### 3.1 Consent screen content

Presented before any credential field is shown, in plain language:

- What is collected: student number, ERS password, birthdate.
- What happens: sent once over an encrypted connection, used to sign in to ERS and read the schedule page, then discarded.
- What is kept: the schedule. Not the password.
- What is not done: nothing is changed in ERS; nothing is submitted; no other page is read.
- The alternative: paste the schedule instead, or enter it by hand.
- The residual risk, stated rather than buried.

The student must take an explicit action to proceed. There is no pre-ticked box.

### 3.2 Field requirements

The ERS login form has three fields. All three are required.

| Field | Notes |
|---|---|
| Student number | Prefilled from the OneTUP account |
| ERS password | Masked, never autofilled by OneTUP, `autocomplete="off"` |
| Birthdate | Date input; normalised client-side to the portal's expected format |

The birthdate requirement is easy to miss and a common cause of confusing failures — the form rejects with the same message whether the password or the birthdate is wrong.

---

## 4. Sync Worker

### 4.1 Why it is separate

- Needs a real browser runtime; cannot run on Vercel functions or Supabase Edge.
- Handles credentials; isolation limits blast radius.
- Has a different scaling and failure profile from the rest of the system.

### 4.2 Hard constraints

The worker:

- Has **no database credentials** and no network path to Supabase.
- Has **no persistent volume**. The container filesystem is ephemeral and read-only except for the browser's temporary profile directory.
- **Never logs request bodies**, headers containing credentials, or any field named or shaped like a password.
- Runs each scrape in a **fresh browser context** that is destroyed on completion.
- **Zeroes credential buffers** before returning.
- Has a **hard timeout** of 60 seconds per job; the process is killed on exceeding it.
- Accepts requests only from the application origin, authenticated by a shared secret that is rotated quarterly.

### 4.3 Interface

```
POST /scrape/schedule
Authorization: Bearer <worker_secret>
Content-Type: application/json

{ "student_number": "...", "password": "...", "birthdate": "YYYY-MM-DD" }
```

Response is the parsed schedule, or a structured error. The request body is never echoed, in success or in failure.

### 4.4 Procedure

```
1. Launch headless browser, fresh context, images disabled
2. Navigate to the ERS login page
3. Wait for the username field to be present
4. Fill username and password
5. Set the birthdate field
      the field is readonly and driven by a datepicker widget;
      remove the readonly attribute, set the value, and dispatch
      input, change, and blur events so the widget's own handlers run
6. Submit
7. Wait for navigation away from the login URL
      if the URL is unchanged, authentication failed
8. Navigate to the schedule page
9. Wait for the schedule table to be present
10. Extract the table HTML
11. Parse rows
12. Zero credential buffers
13. Destroy browser context
14. Return parsed rows
```

Step 5 is the fragile one. The portal's birthdate field is not a plain input, and setting `value` alone will not satisfy validation that listens for widget events.

### 4.5 Parsing

Each data row yields seven cells. Column indices are a known fragility — they are captured in a versioned parser configuration rather than hard-coded, so a layout change is a config update rather than a redeploy.

```
parser_version: "ers-sched-1.2.0"
table_selector: "table.dbtable"
row_selector:   "tr[bgcolor='white']"
columns:
  index: 0    number: 1    title: 2
  lec: 3      lab: 4       units: 5
  faculty: 6  schedule: 7
```

**Schedule string sub-parsing**

```
1. Split on " - "; take the final segment
2. Match ^(\w+)\s+([\d:APM]+-[\d:APM]+)\s*(.*)$
3. Map the day code, testing longest codes first:
      SUN → sunday    TH → thursday
      M → monday      T  → tuesday     W → wednesday
      F → friday      S  → saturday
   Order is load-bearing: testing "T" before "TH" misreads
   every Thursday class as Tuesday.
4. Split the time range on "-"; parse each side, handling both
   "10:00AM" and "10:00 AM"
5. Remainder is the room; empty → "TBA"
6. On match failure: parse_status = "failed", preserve the raw string
```

**Compound day codes.** Some rows encode multiple days in one string. Where the day code matches a known multi-day pattern (`MW`, `TTH`, `MWF`), expand into one meeting per day. Test multi-day patterns before single-day ones.

### 4.6 Failure taxonomy

| Condition | Code | Message to student |
|---|---|---|
| Login URL unchanged after submit | `ERS_AUTH_FAILED` | "Those details didn't work on ERS. Check your password and birthdate." |
| Portal unreachable or timing out | `ERS_UNAVAILABLE` | "ERS isn't responding right now. Try again in a bit, or paste your schedule." |
| Logged in, table absent | `SCHEDULE_NOT_FOUND` | "We got in, but couldn't find a schedule. You may not be enrolled yet this term." |
| Table present, some rows unparsed | `SCHEDULE_PARSE_FAILED` | "We read most of your schedule. Two rows need checking." |
| Job exceeded 60s | `ERS_TIMEOUT` | "That took too long. Try again, or paste your schedule." |

The auth failure message deliberately does not distinguish which field was wrong. Doing so would make the endpoint useful for probing.

---

## 5. Client-side credential handling

### 5.1 During the request

- Credential state lives in a component-local variable, never in a global store, never in Redux/Zustand, never in React Query cache.
- Cleared immediately after the request resolves, in both success and failure paths.
- The password field uses `autocomplete="off"` and `spellcheck="false"`.
- Nothing credential-related is ever written to `localStorage` or `sessionStorage`.

### 5.2 Optional device-side retention

Re-sync would otherwise require re-entering credentials every time. Students may opt in to remembering them **on that device only**.

```
Encryption:  AES-GCM, 256-bit
Key:         PBKDF2-SHA256, 210,000 iterations, over the student's OneTUP
             password, with a per-device random salt
Storage:     IndexedDB, on the device only
Transmitted: never — the key is derived at use time from the password the
             student enters to unlock, and never leaves the device
Cleared on:  sign-out, OneTUP password change, opt-out, 90 days unused
```

Even with this enabled, credentials still transit to the worker on each sync — encryption at rest on the device protects against device theft, not against the transit exposure. This is stated to the student when they enable it.

Default is **off**.

### 5.3 What this does not do

It does not make the credential storage "safe" in an absolute sense. It makes it safer than the alternative of a server-side vault, and it puts the decision and the artefact in the student's own hands. That is the honest claim, and it is the one made in the interface.

---

## 6. Abuse prevention

| Control | Value | Purpose |
|---|---|---|
| Import rate limit | 5 per user per hour | Prevents using OneTUP to hammer ERS |
| Consecutive failure lockout | 3 failures → 15 minutes | Prevents credential-testing through our endpoint |
| Global concurrency cap | Configurable, default 10 | Prevents OneTUP generating load ERS would notice |
| Per-IP sign-up limit | 5 per day | Limits automated account creation |
| Worker auth | Shared secret, quarterly rotation | Only OneTUP can invoke the scraper |

The concurrency cap matters for a reason beyond our own protection: a burst of simultaneous logins from one source is exactly the traffic shape that looks like an attack to whoever monitors ERS. Staying quiet is part of being a good citizen on infrastructure we do not own.

---

## 7. Alternative import paths

All three produce the same reviewed-proposal output and feed the same commit endpoint.

### 7.1 Paste import

The student copies their ERS schedule page and pastes it. Parsing attempts, in order:

1. HTML table parse, if the paste retained markup
2. Tab- or multi-space-delimited parse
3. Line-by-line heuristic using the same schedule-string regex

Always available. Requires no credentials. It is the floor beneath everything else, and it must never be removed.

### 7.2 Browser extension — the preferred future

A companion extension reads the schedule page the student is **already authenticated on**, in their own browser, and sends only parsed JSON.

Credentials never leave the device. Not even transiently. This is strictly better than the worker path and is the target state.

Not in V1 because it requires a separate build, a store review, and its own update channel — significant additional surface for a solo maintainer. The import interface (§8) is designed so it can be added without touching anything else.

### 7.3 Sanctioned integration — the target

If TUP provides a read-only student data endpoint, it replaces everything above. The interface below is the reason that substitution would be a configuration change.

---

## 8. Import interface abstraction

```
interface ScheduleImporter {
  readonly id: string
  readonly requiresCredentials: boolean
  readonly available: boolean
  import(context: ImportContext): Promise<ImportProposal>
}

interface ImportProposal {
  parserVersion: string
  courses: ParsedCourse[]
  unparsed: RawRow[]
  warnings: ImportWarning[]
}
```

Implementations: `ErsWorkerImporter`, `PasteImporter`, `ExtensionImporter`, `SanctionedApiImporter`.

The application selects an importer by availability and student preference. **Nothing downstream of `ImportProposal` knows or cares where the data came from.** That property is what makes the migration path real rather than aspirational.

---

## 9. Session management

| Setting | Value |
|---|---|
| Provider | Supabase Auth, email and password |
| Access token | JWT, 1 hour |
| Refresh token | 30 days, rotating |
| Storage | httpOnly cookie where possible; otherwise memory plus refresh |
| Sign-out | Revokes refresh token; clears IndexedDB credential entry if present |
| Password reset | Email link, 1 hour expiry |
| Email verification | Required before ERS connection is offered |

Email verification gates ERS connection specifically. An unverified account should not be able to invoke the scraper.

---

## 10. Privacy commitments

Published, and enforced by the design rather than by policy:

1. **ERS credentials are never stored on OneTUP servers.** No database column exists for them.
2. **Grades and attendance are visible only to the student.** No administrative override exists.
3. **Personal academic values are never sent to any AI provider.** No capability requires them.
4. **Full export** in a machine-readable format, on demand.
5. **Deletion is real.** Account deletion cascades to every owned row and completes within 30 days.
6. **No advertising, no data sale, no analytics broker.** Telemetry is self-hosted and aggregate.

---

## 11. Incident response

| Event | Response |
|---|---|
| Worker compromise suspected | Rotate the worker secret, redeploy from a clean image, disable the import endpoint, notify all users who imported in the exposure window and advise an ERS password change |
| Anomalous import volume | Automatic global concurrency reduction; alert the maintainer |
| ERS reports abuse | Disable the import endpoint immediately, fall back to paste, engage the responsible office |
| Parser failure rate above 10% | Alert, capture failing samples, publish the paste fallback prominently |
| Supabase breach disclosed | Grades and attendance exposed; ERS credentials are not, because they are not there. Notify, rotate keys, follow Supabase guidance |

The distinction in the last row is the whole point of ADR-003. A database breach is bad. A database breach that also hands over working portal credentials for hundreds of students is a different category of event, and the architecture ensures it cannot happen.

---

## 12. Pre-launch checklist

- [ ] No credential field exists in any migration
- [ ] Worker has no database credentials and no persistent volume
- [ ] Worker logs contain no request bodies — verified by inspection under load
- [ ] `sync_jobs.error_detail` sanitised; test asserts credential-shaped values cannot reach it
- [ ] Consent screen reviewed for plain language and honest risk statement
- [ ] Paste fallback tested and reachable at every failure point
- [ ] Rate limits and lockout verified under test
- [ ] Client credential state confirmed cleared after both success and failure
- [ ] Device-side encryption tested including key rotation on password change
- [ ] Product confirmed fully usable without ever entering ERS credentials
- [ ] Acceptable-use position understood and documented
- [ ] Incident runbook written and reachable
