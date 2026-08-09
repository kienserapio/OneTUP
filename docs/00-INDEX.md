# OneTUP — Documentation Set

**Product:** OneTUP
**Institution:** Technological University of the Philippines — Manila
**Owner:** Kien Leriss Ramos Serapio
**Status:** V1 built, running locally, not deployed — see [11-HANDOVER.md](11-HANDOVER.md)
**Version:** 1.0
**Date:** August 2026

---

## What OneTUP is

One application that holds a TUP Manila student's entire academic life: schedule, attendance, grades, deadlines, announcements, study material, campus navigation, and commute planning. It answers a single question when opened: **what do I need to know today?**

Free forever, for every TUP student, in every program.

---

## Document map

| # | Document | What it covers | Primary reader |
|---|---|---|---|
| 01 | [Product Requirements](01-PRD.md) | Problem, users, scope, requirements, success criteria | Everyone |
| 02 | [Architecture & Decision Records](02-ARD.md) | System architecture, 14 ADRs with rationale | Engineers |
| 03 | [Technical Design — App Module](03-TDD-APP-MODULE.md) | Dashboard/app module design, logic, state, algorithms | Engineers |
| 04 | [Data Model & Schema](04-DATA-MODEL.md) | Full Postgres schema, RLS policies, migrations | Engineers |
| 05 | [API Specification](05-API-SPEC.md) | Internal API + public TUP Data API | Engineers, integrators |
| 06 | [AI Specification](06-AI-SPEC.md) | Model routing, prompts, guardrails, evaluation | Engineers |
| 07 | [Auth & ERS Integration](07-AUTH-ERS.md) | Sign-up, credential handling, scraper service | Engineers, security |
| 08 | [Landing Page Content](08-LANDING-CONTENT.md) | Copy only, no design | Design, marketing |
| 09 | [Implementation Plan & QA](09-IMPLEMENTATION-PLAN.md) | SDLC phases, sprints, testing, release, ops | Everyone |
| 10 | [Future Enhancements](10-FUTURE-ENHANCEMENTS.md) | Agentic roadmap, TUP Data API strategy | Product |
| 11 | [Build Handover](11-HANDOVER.md) | What was actually built, what bites, what is pending | Engineers |

---

## Reading order

**If you are building it:** 01 → 02 → 04 → 03 → 07 → 06 → 05 → 09
**If you are evaluating it:** 01 → 02 → 10
**If you are designing it:** 01 → 08 → 03
**If you are auditing it:** 07 → 04 → 02

---

## Scope of this version

**In scope (V1):** the app/dashboard module — schedule, attendance, grades, deadlines, announcements, commute, study, assistant, faculty evaluation, campus.

**Explicitly out of scope:** the design system and visual specification. These documents describe *what each module does, why, and how it behaves*. They deliberately do not prescribe component placement, layout, or styling. Visual direction is summarised in PRD §9 as constraints only.

---

## Non-negotiable principles

These appear throughout and override convenience:

1. **Schedule is the spine.** Every other feature reads from or writes to it.
2. **Credentials are never persisted server-side.** Not ERS, not any third party.
3. **Row-level security on every user-owned table, from the first migration.**
4. **AI output is labelled, sourced, and never authoritative** on grades, prerequisites, fares, or policy.
5. **Attendance and grades are private to the student.** No aggregates, no faculty visibility, no leaderboards.
6. **Offline-first for anything a student needs while standing in a corridor.**
7. **Every automated action is reversible and carries a receipt** explaining why it happened.
