# OneTUP — API Specification

**Version 1.0 · August 2026**

Three surfaces:

| Surface | Base | Auth | Purpose |
|---|---|---|---|
| **Data API** | Supabase PostgREST | JWT, RLS-enforced | Ordinary CRUD on student data |
| **Service API** | `/api/*` (Edge Functions) | JWT | Operations needing server-side logic or secrets |
| **TUP Data API** | `/v1/*` (public) | None, rate-limited | Non-personal reference data, open to anyone |

---

## 1. Conventions

- JSON request and response bodies, `application/json`, UTF-8.
- Timestamps ISO 8601 with offset. Dates `YYYY-MM-DD`. Times of day `HH:MM` 24-hour.
- Errors follow a single envelope.
- Every request carries `X-Request-Id`; the server echoes it.
- Pagination via `?limit=` and `?cursor=`, default 50, maximum 200.

### 1.1 Error envelope

```json
{
  "error": {
    "code": "SCHEDULE_PARSE_FAILED",
    "message": "Some rows could not be read from your ERS schedule.",
    "detail": { "rows_failed": 2, "rows_parsed": 5 },
    "retryable": true,
    "request_id": "req_01J..."
  }
}
```

`message` is user-facing and must be safe to display verbatim. `detail` is for the client, never for the user.

### 1.2 Error codes

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | no | Missing or invalid token |
| `FORBIDDEN` | 403 | no | Authenticated but not permitted |
| `NOT_FOUND` | 404 | no | Resource absent or not visible |
| `VALIDATION_FAILED` | 422 | no | Request body failed validation |
| `RATE_LIMITED` | 429 | yes | Too many requests; `Retry-After` present |
| `ERS_UNAVAILABLE` | 503 | yes | Portal unreachable |
| `ERS_AUTH_FAILED` | 401 | no | Portal rejected the credentials |
| `SCHEDULE_PARSE_FAILED` | 422 | yes | Fetch succeeded, parse partially failed |
| `AI_UNAVAILABLE` | 503 | yes | No model available |
| `AI_INVALID_OUTPUT` | 502 | yes | Model returned unusable structure |
| `AI_QUOTA_EXCEEDED` | 429 | yes | Provider quota exhausted |
| `INTERNAL` | 500 | yes | Unhandled |

---

## 2. Data API (PostgREST)

Standard Supabase client access. Authorisation is entirely RLS — there is no service-layer permission logic to keep in sync.

```
GET    /rest/v1/schedule_blocks?select=*,enrollments(*,courses(*))&order=day,start_time
POST   /rest/v1/attendance_records
PATCH  /rest/v1/deadlines?id=eq.<uuid>
DELETE /rest/v1/deadline_subtasks?id=eq.<uuid>
```

Clients never send `user_id`. It is derived from the JWT by policy defaults, which removes an entire class of impersonation bug.

### 2.1 Views exposed

| View | Returns |
|---|---|
| `v_attendance_summary` | Per-enrollment absence counts and remaining allowance |
| `v_gwa` | Term GWA, graded units, projection flag |
| `v_deadlines_upcoming` | Open deadlines within 14 days with computed urgency |
| `v_today` | Today's blocks joined to course, room, and attendance state |

All are `security_invoker = true`.

---

## 3. Service API

### 3.1 `POST /api/ers/import`

Starts a schedule import. Full security discussion in [07-AUTH-ERS.md](07-AUTH-ERS.md).

**Request**

```json
{
  "student_number": "TUPM-23-1234",
  "password": "••••••••",
  "birthdate": "2004-03-17",
  "term_code": "2025-2026-2"
}
```

**Response 200**

```json
{
  "job_id": "uuid",
  "status": "succeeded",
  "parser_version": "ers-sched-1.2.0",
  "rows_parsed": 6,
  "rows_failed": 0,
  "schedule": [
    {
      "code": "CS 3105",
      "title": "Software Engineering",
      "lec_units": 2, "lab_units": 1, "units": 3,
      "faculty": "DELA CRUZ, R.",
      "raw_schedule": "LEC - M 10:00AM-12:00PM RM312",
      "meetings": [
        { "day": "monday", "start_time": "10:00", "end_time": "12:00",
          "room": "RM312", "parse_status": "ok" }
      ]
    }
  ],
  "unparsed": []
}
```

**Behaviour**

- The request body is never logged, in whole or in part.
- Credentials are held only in the worker's process memory and zeroed on completion.
- Nothing is committed to the database. The response is a proposal the client presents for review.
- `unparsed` holds raw rows for manual entry.

**Errors:** `ERS_AUTH_FAILED`, `ERS_UNAVAILABLE`, `SCHEDULE_PARSE_FAILED`, `RATE_LIMITED`.

Rate limit: 5 per user per hour, 3 consecutive auth failures triggers a 15-minute lockout. The lockout is important — it stops OneTUP being used as a credential-testing oracle against ERS.

### 3.2 `POST /api/schedule/commit`

Commits a reviewed schedule.

```json
{
  "term_code": "2025-2026-2",
  "source": "ers_import",
  "job_id": "uuid",
  "courses": [
    {
      "code": "CS 3105", "title": "Software Engineering",
      "lec_units": 2, "lab_units": 1, "units": 3,
      "faculty": "DELA CRUZ, R.",
      "meetings": [
        { "day": "monday", "start_time": "10:00", "end_time": "12:00", "room": "RM312" }
      ]
    }
  ]
}
```

Response returns created enrollment and block IDs. Idempotent on `job_id` — a retried commit does not duplicate.

### 3.3 `POST /api/schedule/diff`

Compares a fresh import against the committed schedule.

```json
{
  "changes": [
    { "kind": "room_change", "course_code": "CS 3105",
      "day": "wednesday", "from": "RM312", "to": "RM305",
      "block_id": "uuid" },
    { "kind": "course_added", "course_code": "CS 3108", "detail": { } }
  ]
}
```

`kind` ∈ `course_added | course_removed | room_change | time_change | day_change | faculty_change`. The client presents each for individual accept or reject.

### 3.4 `POST /api/announcements/ingest`

Accepts a shared announcement.

**Request** — `multipart/form-data` from the share target, or JSON:

```json
{ "text": "raw shared content", "image": "<file>", "source": "share_target" }
```

**Response**

```json
{
  "duplicate_of": null,
  "proposal": {
    "course_code": "CS 3107",
    "type": "quiz",
    "event_date": "2026-08-07",
    "event_time": "14:00",
    "summary": "Long quiz moved to Friday, coverage up to pumping lemma.",
    "detail": "cleaned original text",
    "creates_deadline": true,
    "confidence": 0.86
  },
  "warnings": []
}
```

If `duplicate_of` is non-null, the client offers to confirm the existing announcement instead of creating a new one.

A proposal is never auto-published. `POST /rest/v1/announcements` with the reviewed content does that, subject to the insert policy.

### 3.5 `POST /api/deadlines/extract`

Photo or text to a proposed deadline.

```json
{ "image": "<file>" }
```

```json
{
  "proposal": {
    "title": "Sprint 2 documentation",
    "course_code": "CS 3105",
    "due_date": "2026-08-05",
    "due_time": "23:59",
    "confidence": 0.72
  },
  "ocr_text": "..."
}
```

Confidence below 0.6 returns fields as suggestions with empty defaults, so a low-confidence read never silently pre-fills something wrong.

### 3.6 `GET /api/commute/routes`

```
GET /api/commute/routes?area_id=<uuid>&direction=inbound&at=2026-08-09T06:00:00+08:00
```

```json
{
  "routes": [
    {
      "id": "uuid",
      "rank": "fastest",
      "total_minutes": 55,
      "peak_minutes_applied": 20,
      "total_fare_regular": 51.00,
      "total_fare_student": 41.00,
      "last_verified_at": "2026-07-27T00:00:00+08:00",
      "freshness": "fresh",
      "legs": [
        {
          "ordinal": 1, "mode": "jeep",
          "from_label": "Grace Park", "to_label": "Monumento",
          "duration_minutes": 12,
          "fare_regular": 13.00, "fare_student": 11.00,
          "fare_rule": "puv_student_20",
          "geometry": { "type": "LineString", "coordinates": [] },
          "notes": null
        }
      ]
    }
  ],
  "alerts": [
    { "kind": "peak", "severity": "heavy", "corridor": "rail",
      "message": "LRT-1 queues at Monumento are long right now. Add 20–25 minutes." }
  ]
}
```

`at` lets the client request a plan for a future departure, which is how the departure planner evaluates tomorrow's conditions rather than now's.

### 3.7 `GET /api/departure/plan`

```
GET /api/departure/plan?date=2026-08-09
```

```json
{
  "plan_date": "2026-08-09",
  "class_start": "2026-08-09T07:00:00+08:00",
  "arrive_by":   "2026-08-09T06:45:00+08:00",
  "leave_at":    "2026-08-09T05:40:00+08:00",
  "wake_at":     "2026-08-09T04:55:00+08:00",
  "base_minutes": 50,
  "adjustments": [
    { "kind": "peak",    "minutes": 20, "reason": "LRT-1 morning peak" },
    { "kind": "weather", "minutes": 15, "reason": "70% chance of rain at 06:00" }
  ],
  "explanation": "Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6 AM, so your alarm moved 15 minutes earlier.",
  "route_id": "uuid",
  "first_course": "MATH 2103"
}
```

`explanation` is templated from `adjustments` on the server, so client and notification copy never diverge.

### 3.8 `POST /api/ai/:capability`

Single entry point to the AI Gateway. See [06-AI-SPEC.md](06-AI-SPEC.md) for capabilities and contracts.

```json
{ "input": { }, "options": { "locale": "en" } }
```

```json
{
  "capability": "announcement_extract",
  "output": { },
  "meta": {
    "model": "…",
    "prompt_version": "1.3.0",
    "cache_hit": false,
    "latency_ms": 1420,
    "labelled": true
  }
}
```

`meta.labelled` tells the client to render the result as generated content. It is always true when a model produced any part of the output.

### 3.9 `POST /api/assistant/query`

```json
{ "query": "ilang cuts pa meron ako sa software eng?", "locale": "auto" }
```

```json
{
  "route": "own_data",
  "answer": "Tatlo sa lima na ang nagamit mo sa CS 3105 — dalawa na lang ang natitira.",
  "computed": {
    "template": "absences_remaining",
    "values": { "course": "CS 3105", "used": 3, "allowed": 5, "remaining": 2 }
  },
  "citations": [],
  "actions": [],
  "labelled": false
}
```

`labelled: false` here because the numbers were computed and only the phrasing came from a template. A `tup_knowledge` route returns `labelled: true` with populated `citations`.

### 3.10 `POST /api/notifications/subscribe`

Registers a Web Push subscription. Body is the standard `PushSubscription` JSON. Returns the subscription ID.

---

## 4. TUP Data API (public)

A standalone read-only API over non-personal institutional data. See [10-FUTURE-ENHANCEMENTS.md](10-FUTURE-ENHANCEMENTS.md) for why this is strategically the most important component.

**Base:** `https://api.onetup.ph/v1`
**Auth:** none. Rate limited to 60 requests per minute per IP.
**CORS:** open.
**Caching:** `Cache-Control: public, max-age=3600`.
**Licence:** data published under CC BY 4.0, so others may build on it with attribution.

### 4.1 `GET /v1/programs`

```json
{
  "data": [
    { "code": "BSCS", "name": "BS Computer Science",
      "college": "College of Science", "total_units": 168,
      "curriculum_versions": ["2018","2023"] }
  ]
}
```

### 4.2 `GET /v1/programs/:code/curriculum`

```
GET /v1/programs/BSCS/curriculum?version=2023
```

```json
{
  "program": "BSCS",
  "version": "2023",
  "total_units": 168,
  "terms": [
    {
      "year": 3, "term": 2,
      "courses": [
        {
          "code": "CS 3105", "title": "Software Engineering",
          "units": 3, "lec_units": 2, "lab_units": 1,
          "prerequisites": ["CS 2102"],
          "corequisites": [],
          "is_elective": false
        }
      ]
    }
  ]
}
```

### 4.3 `GET /v1/courses/:code`

```json
{
  "code": "CS 3105",
  "title": "Software Engineering",
  "units": 3,
  "description": "…",
  "prerequisites": ["CS 2102"],
  "unlocks": ["CS 4101", "CS 4102"],
  "offered_in": ["BSCS"]
}
```

`unlocks` is the reverse prerequisite edge, precomputed. It is what makes "if I fail this, what happens?" answerable in one request.

### 4.4 `GET /v1/prerequisites/graph`

```
GET /v1/prerequisites/graph?program=BSCS&version=2023
```

Returns the full directed graph as nodes and edges, so a client can run its own traversal without N round trips.

```json
{
  "nodes": [{ "code": "CS 3105", "units": 3, "year": 3, "term": 2 }],
  "edges": [{ "from": "CS 2102", "to": "CS 3105", "kind": "prerequisite" }]
}
```

### 4.5 `GET /v1/calendar`

```
GET /v1/calendar?academic_year=2026-2027
```

```json
{
  "academic_year": "2026-2027",
  "events": [
    { "date": "2026-08-17", "title": "Enrollment opens, 1st semester",
      "kind": "enrollment", "scope": "university" }
  ]
}
```

`kind` ∈ `enrollment | classes_start | classes_end | exams | holiday | suspension | deadline | ceremony`.

### 4.6 `GET /v1/campus/places`

```
GET /v1/campus/places?campus=manila&category=printing
```

```json
{
  "data": [
    {
      "id": "uuid", "category": "printing", "name": "Library basement",
      "description": "Black and white only. Shortest queue before 9 AM.",
      "location": { "lat": 14.5863, "lng": 120.9869 },
      "building_code": "LIB", "floor": "B1",
      "hours": { "mon_fri": "07:00-19:00" },
      "price_min": 2.00, "price_max": 2.00, "price_unit": "per_page",
      "last_verified_at": "2026-08-03T00:00:00+08:00",
      "freshness": "fresh"
    }
  ],
  "attribution": "Community-maintained. Verify prices before relying on them."
}
```

### 4.7 `GET /v1/campus/rooms/:number`

```
GET /v1/campus/rooms/312
```

```json
{
  "room": "312",
  "building": { "code": "COS", "name": "College of Science" },
  "floor": "3",
  "nearest_gate": { "name": "Main gate — Ayala Blvd", "walk_minutes": 4 },
  "confidence": "range_match"
}
```

`confidence` ∈ `exact | range_match | prefix_guess`, so a client can decide how firmly to present the result.

### 4.8 `GET /v1/organizations`

Student organisations: name, college, contact, whether currently accredited.

### 4.9 MCP endpoint

The same dataset is exposed as a Model Context Protocol server at `https://api.onetup.ph/mcp`, so any AI assistant can query TUP data directly.

**Tools exposed:** `get_curriculum`, `get_course`, `check_prerequisites`, `get_calendar`, `find_room`, `list_places`.

All read-only. No personal data is reachable through this interface under any circumstances — the MCP server connects only to the public reference tables and holds no credentials for anything else.

---

## 5. Webhooks (inbound)

### 5.1 `POST /api/webhooks/messenger`

Receives messages sent to the official OneTUP Facebook Page. Verifies `X-Hub-Signature-256` against the app secret before doing anything else.

Flow: verify → identify sender against a linked OneTUP account → run the announcement pipeline → notify the sender in-app to review the proposal.

Unlinked senders receive a reply explaining how to link their account. No content from an unlinked sender is processed.

---

## 6. Rate limits

| Endpoint | Limit |
|---|---|
| `/api/ers/import` | 5 / hour / user; 3 consecutive failures → 15 min lockout |
| `/api/ai/*` | 30 / hour / user across all capabilities |
| `/api/assistant/query` | 40 / hour / user |
| `/api/announcements/ingest` | 20 / hour / user |
| `/api/deadlines/extract` | 15 / hour / user |
| PostgREST | Supabase defaults |
| `/v1/*` public | 60 / minute / IP |

Exceeding a limit returns 429 with `Retry-After`. AI limits are deliberately lower than provider limits so OneTUP degrades gracefully rather than being cut off mid-session.

---

## 7. Versioning

- The public TUP Data API is versioned in the path. `/v1` is supported for at least 12 months past any `/v2`.
- The service API is unversioned and moves with the client; both deploy together.
- Prompt versions are independent and recorded on every AI run, so a regression can be traced to a specific prompt change.
