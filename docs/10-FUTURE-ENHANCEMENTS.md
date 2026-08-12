# OneTUP — Future Enhancements

**Version 1.0 · August 2026**

Nothing here is in the V1–V2 scope. This document exists so the architecture built now does not preclude any of it later.

---

## 1. The reframe: agentic means it works when you are not looking

A chatbot waits for you. An agent watches your semester and acts between sessions.

**Reactive:** student asks "when am I free?" → answer.

**Agentic:** a quiz gets announced at 11 PM. By morning the deadline exists, a study pack has been built from notes the student already uploaded, two review blocks sit in their actual free time, and Friday's alarm has moved 20 minutes earlier because the quiz is at 2 PM and there is a 7 AM class first.

Nobody opened the app. That is the whole idea.

This is an architectural difference, not a feature. It is why §2 comes before the feature list.

---

## 2. The event loop

Build a background agent that **subscribes to state changes**, rather than a chat endpoint that fires on request.

### 2.1 Events worth reacting to

| Event | Source |
|---|---|
| Announcement published | `announcements` insert |
| Schedule diff detected | Re-sync job |
| Grade recorded or changed | `grades` write |
| Deadline crosses 72h / 24h / 6h | Scheduled evaluation |
| Attendance threshold crossed | `attendance_records` write |
| Free block opens (class cancelled) | Schedule change |
| Weather or transit disruption on a class day | External signal |
| Groupmate completes a shared subtask | `deadline_subtasks` write |
| Study pack falls behind its deadline | Scheduled evaluation |

### 2.2 The chain

Every event runs the same five steps:

```
detect → interpret → decide → act → log
```

**Log matters as much as act.** Every autonomous action writes to `audit_log` with a `reason` string. That string becomes the receipt shown beside the action in the interface.

### 2.3 Cost

These are short prompts over structured data, not long conversations. Most steps need no model at all — threshold crossings and schedule diffs are deterministic. Queued and batched, this fits inside free tiers comfortably.

---

## 3. Capabilities worth building

### 3.1 Enrollment agent — the standout

Philippine enrollment is genuinely brutal: prerequisite chains, section conflicts, slots that vanish in minutes.

An agent that:
- reads the curriculum checklist and computes what **must** be taken to graduate on time
- builds conflict-free schedule options ranked by stated preferences (no 7 AMs, keep Thursday afternoon free for org work)
- watches for a slot to open and notifies within seconds

Students would install OneTUP for this alone. It requires the TUP Data API (§4) underneath, which is why the API is step one.

### 3.2 Graduation path simulator

*"If I fail CS 3105, what happens?"* → traverse the prerequisite graph and show the downstream damage: capstone delayed two terms, graduation slips to 2028, these three subjects become unavailable.

Students make this decision blind every term. The `unlocks` reverse edge in the API (§4.3 of the API spec) exists specifically to make this a single query.

### 3.3 Contradiction detection

ERS says Rm 312. The class representative posted 305. The saved schedule says 312.

Instead of silently picking one, surface: *"Three sources disagree about Wednesday's room, and the class representative's is newest."*

Mundane-sounding, and disproportionately important — it is the kind of thing that makes an app feel trustworthy rather than merely clever.

### 3.4 Absence catch-up

A student marks themselves absent on Tuesday. The agent assembles what they missed: announcements from that day, the module section scheduled, deadlines that appeared, and who in their section has shared resources. One card, unprompted.

### 3.5 Agent-to-agent group scheduling

A group needs to meet. Instead of a poll, each member's OneTUP negotiates on their behalf against their real schedules and stated constraints, returning three slots that already work for everyone.

Genuinely AI-native: the agents coordinate, the humans confirm. Nothing in the student space does this.

### 3.6 Personal calibration

The agent learns the student's own patterns rather than applying generic advice:

- consistently underestimates SE deliverables by two days
- grades dip when carrying more than three deadlines in a week
- never actually studies on Wednesdays despite blocking time

Warnings become calibrated to the individual. This is a small model over the student's own history, and it is what makes the app feel like it knows them.

### 3.7 Drafting that goes somewhere

Consultation request to a professor in the right register. Excuse letter in the format TUP expects. Petition for a subject.

The agent drafts; the student reviews and sends. **Nothing auto-sends outside the app**, ever.

---

## 4. The TUP Data API is the actual moat

Strategically more important than the app itself.

### 4.1 What it holds

Curriculum trees and prerequisite graphs per program · course catalog · academic calendar · campus geometry · organisation directory · faculty and consultation hours.

All non-personal. All shareable.

### 4.2 Why it matters more than OneTUP

**Agents need structured, authoritative data.** An agent reasoning over scraped PDFs is guessing. An agent querying a prerequisite graph is computing. Every capability in §3 is downstream of this existing.

**It is the thing that can be officially blessed.** TUP administration will never approve "an app that scrapes ERS." They might well approve "a structured, read-only public API for curriculum and campus data, maintained by students." That is a far easier conversation, and the GDG on Campus role gives standing to have it.

**It makes OneTUP infrastructure rather than an app.** Other students build on it — thesis projects, org tools, hackathon entries. Every dependent is a reason the API must keep existing.

**It survives the maintainer graduating.** An app owned by one person dies in 2027. An API with dependents gets maintained.

### 4.3 MCP exposure

Expose the same dataset as a Model Context Protocol server. Any AI assistant can then query TUP data directly — a student asks their assistant "what are the prerequisites for capstone at TUP" and it actually knows.

Forward-looking, nearly free once the API exists, and it means OneTUP's own agent talks to TUP data through the same interface as everyone else. No privileged backdoor.

### 4.4 Design rule

**The API is the only interface.** OneTUP's UI, OneTUP's agent, and third parties all use identical endpoints. That constraint keeps it honest and prevents the agent depending on internals.

---

## 5. Positioning: agentic without saying "AI"

The language never mentions models. It describes what happened.

| Not this | This |
|---|---|
| "AI generated a study plan" | "Your Friday is handled." |
| "AI-powered scheduling" | "Found three slots that work for everyone." |
| "AI detected a conflict" | "Three sources disagree about your Wednesday room." |
| "Smart notifications" | "Your alarm moved 15 minutes earlier." |

The line stays *"it keeps up with your semester."* People will assume there is AI in it. They will not feel sold one.

### 5.1 Receipts, always

Every autonomous action carries a one-line explanation: *"Added because your class representative posted this at 11:42 PM."* Tap it, see the source.

This is what separates **"how did it know?"** (delightful) from **"why did it do that?"** (unsettling). It is also the defence when the agent gets something wrong — and it will.

### 5.2 Permission tiers

Per capability, not global:

```
observe  →  suggest  →  act and notify  →  act silently
```

New capabilities default to **suggest**. Students promote the ones they come to trust. Nothing irreversible or outward-facing (sending an email, dropping a subject) ever runs without confirmation, at any tier.

### 5.3 Undo on everything

An agent that acts without an undo is just an app doing things you did not ask for.

---

## 6. Sequencing

**First: the TUP Data API.** Even a hand-seeded BSCS-only version unlocks the enrollment agent and the graduation simulator. Start with one program, expand outward.

**Second: one background agent, one event.** Announcement lands → deadline created → study pack built → review blocks proposed. Ship that single chain end to end, with receipts and undo. If it feels right, the pattern generalises to everything else.

The enrollment agent is the demo that gets people talking, but it needs the API underneath. So the API is genuinely step one.

---

## 7. What agentic raises the stakes on

A chatbot giving a bad answer is annoying. An agent that silently moves an alarm or misreads a prerequisite can cost someone a semester.

So the receipts, the undo, and the *"I'm not sure, here's what I found"* fallback are not polish. They are what makes the autonomy safe enough to grant.

Specific hazards to design against before any of this ships:

| Hazard | Mitigation |
|---|---|
| Agent acts on a hallucinated announcement | Never act on unverified community submissions; verified or official only |
| Agent moves an alarm based on stale route data | Staleness gate: no autonomous departure change from a route older than 30 days |
| Agent misreads a prerequisite and advises a wrong enrollment | Prerequisite claims come from the API only, never a model; show the source |
| Cascading actions from one wrong input | Cap actions per event; require confirmation beyond a threshold |
| Student stops checking because the agent handles it, then the agent fails silently | Weekly digest of what the agent did; loud failure, quiet success |

---

## 8. Other enhancements, unranked

**Social and coordination**
Free-block finder across groups · classmate and section discovery · study-buddy matching by shared exam · "I'm running late" broadcast

**Retention**
End-of-term recap, shareable · light streaks · weather and commute widget

**Community**
Moderated shared reviewer library per course · professor consultation hours, crowd-maintained · lost and found

**Academic depth**
Curriculum checklist tracking with remaining requirements · elective planning · thesis and capstone milestone tracking

**Platform**
Multi-campus support (Taguig, Cavite, Visayas) · Filipino-first interface as a full localisation rather than a toggle · offline-first study mode with full pack caching
