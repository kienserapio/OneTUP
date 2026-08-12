# Security Policy

OneTUP holds a student's schedule, attendance, grades, and — briefly, in memory
only — their ERS credentials. A vulnerability here is not an inconvenience. We
take reports seriously and we will not be annoyed that you found something.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately, in either of these ways:

1. **GitHub Security Advisories** — [Report a vulnerability](https://github.com/kienserapio/OneTUP/security/advisories/new)
   (preferred; it gives us a private thread and a CVE path if one is needed)
2. **Email** — kienleriss.serapio@tup.edu.ph with `[SECURITY]` in the subject

Please include:

- What the issue is, and what an attacker gains from it
- Step-by-step reproduction, with the smallest input that triggers it
- The affected route, table, policy, or file if you know it
- Whether you have told anyone else

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | within 72 hours |
| Initial assessment | within 7 days |
| Fix or mitigation for a confirmed high-severity issue | within 30 days |
| Public disclosure | after a fix ships, coordinated with you |

This is a student project without a paid on-call rotation, so these are honest
targets rather than a contractual SLA. If a report goes quiet for a week,
please chase it — it means the message was missed, not ignored.

We do not run a paid bug bounty. We will credit you by name in the advisory and
on the contributors page unless you would rather stay anonymous.

## Scope

**In scope**

- Anything that lets one student read or write another student's data
- Row Level Security gaps: a missing policy, a permissive policy, a view
  without `security_invoker`, a function that escalates
- ERS credential handling — anything that causes a credential to be logged,
  persisted, cached, or transmitted anywhere other than ERS itself
- Authentication and session handling
- Server-side request forgery, injection, or remote code execution in the web
  app or the worker
- Leaking a service role key, a worker secret, or an AI provider key to the
  browser
- Stored or reflected XSS, especially in anything rendered from an imported
  announcement or a pasted schedule

**Out of scope**

- Findings from an automated scanner with no demonstrated impact
- Missing hardening headers with no exploit path
- Denial of service through raw volume
- Social engineering of students or maintainers
- Vulnerabilities in ERS itself — report those to TUP, not to us
- Anything requiring physical access to an unlocked, signed-in device

## The guarantees this project makes

These are the security claims OneTUP makes in its documentation. A working
break of any one of them is, by definition, a valid report.

1. **ERS credentials are never persisted server-side.** They exist in memory
   for the duration of one scrape and are never written to a database, a log,
   or a disk. A schema check in CI fails the build if a column that could hold
   one is ever added. → [docs/07-AUTH-ERS.md](docs/07-AUTH-ERS.md)
2. **RLS is the authorisation model.** Not application code. There is no
   administrative override for a student's grades or attendance.
   → [docs/04-DATA-MODEL.md §17](docs/04-DATA-MODEL.md)
3. **A student's attendance and grades are visible only to that student.** No
   aggregates, no comparisons, no faculty visibility — enforced as the absence
   of any query path that could return them.
4. **Only `NEXT_PUBLIC_*` variables reach the browser.** Anything else in the
   client bundle is a bug.

## Supported versions

OneTUP ships from `main`. Security fixes land there and are deployed; there are
no long-lived release branches to backport to.

## Safe harbour

We will not pursue or support legal action against anyone who reports a
vulnerability in good faith, stays within the scope above, avoids privacy
violations and service degradation, and gives us a reasonable window to fix the
issue before disclosing it. Test against your own account and your own data.
