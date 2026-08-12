import { createHash } from 'node:crypto'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import {
  DEFAULT_PARSER_CONFIG,
  GRADE_PARSER_VERSION,
  parseGradeTable,
  parseScheduleTable,
  type GradeParseResult,
  type ScheduleParseResult,
} from '@onetup/core'

/**
 * ERS scraping.
 *
 * The credential handling here is the reason this service exists as a separate
 * deployable at all. It holds no database credentials, writes nothing to disk,
 * and the buffers holding a password are overwritten before this module returns
 * — so compromising the container yields nothing at rest (ADR-004).
 */

export type ScrapeErrorCode =
  | 'ERS_AUTH_FAILED'
  | 'ERS_UNAVAILABLE'
  | 'ERS_TIMEOUT'
  | 'ERS_SESSION_LOST'
  | 'SCHEDULE_NOT_FOUND'
  | 'SCHEDULE_PARSE_FAILED'
  | 'GRADES_NOT_FOUND'

export class ScrapeError extends Error {
  constructor(
    readonly code: ScrapeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ScrapeError'
  }
}

export interface Credentials {
  studentNumber: string
  password: string
  birthdate: string
}

/**
 * Selector configuration, versioned rather than hard-coded.
 *
 * A layout change on the portal is then a config edit and a version bump, not a
 * code change — and the version is recorded on every import, so a regression
 * can be traced to the exact parser that produced it.
 */
export const SCRAPER_CONFIG = {
  version: DEFAULT_PARSER_CONFIG.version,
  loginPath: 'index.php',
  /** A successful login already lands here; navigating is belt and braces. */
  schedulePath: 'schedule.php?mainID=105&menuDesc=Schedule',
  /**
   * Every semester the student has ever taken is on this one page — which is
   * what makes an automatic GWA history possible at all. Nobody has captured
   * its markup yet, so the parser it feeds assumes nothing about column order.
   */
  /* The full link as the portal's own menu writes it. `mainID` alone reaches
   * the page, but `menuDesc` is what the sidebar sends, and matching the real
   * request exactly is the cheapest insurance against a server that decides to
   * care about it. */
  gradesPath: 'grades.php?mainID=106&menuDesc=Grades',
  selectors: {
    loginForm: 'form[name="frmLogin"]',
    studentNumber: 'input[name="username"]',
    password: 'input[name="password"]',
    birthdate: 'input[name="bdate"]',
    submit: 'form[name="frmLogin"] button[type="submit"]',
    /**
     * The schedule table carries no class or id — `table.dbtable` matches
     * nothing on the live portal. Its data rows are the ones marked
     * `bgcolor="white"`, which is the only stable handle the markup offers.
     */
    row: 'tr[bgcolor="white"]',
    /** Used when the bgcolor convention changes; rows are then found by shape. */
    rowFallback: 'tr',
    /**
     * Narrowing from the portal's own convention to pure shape. Tried in order,
     * in every frame, and the first that yields rows with real cells wins — so
     * a page that abandons `bgcolor`, or nests its table, still reads.
     */
    rowLadder: ['tr[bgcolor="white"]', 'table tr', 'tr', '[role="row"]'],
    /**
     * Every row, including the ones that are not data.
     *
     * The grades reader needs them: `tr[bgcolor="white"]` selects only the
     * subject rows, and the semester heading, the stated GPA and the column
     * names it has to read all sit in rows carrying no such attribute. Handed
     * only the white rows, the parser finds no column names and rejects every
     * subject it was just given.
     */
    contextRowLadder: ['table tr', 'tr', '[role="row"]'],
  },
  /**
   * The portal's birthdate field is a jQuery UI datepicker declared without a
   * `dateFormat`, so it uses that library's default — `mm/dd/yy`, meaning
   * `08/02/2005`. Sending an ISO date here fails validation with the same
   * message a wrong password produces, which is exactly the confusing failure
   * 07-AUTH-ERS.md §3.2 warns about.
   */
  birthdateFormat: 'MM/DD/YYYY',
  timeouts: {
    navigation: 25_000,
    selector: 15_000,
  },
} as const

/** `2005-08-02` → `08/02/2005`. */
export function toPortalBirthdate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${month}/${day}/${year}`
}

/** Slow enough that the page's own keyup handlers keep up. */
const TYPING_DELAY_MS = 40

let browser: Browser | null = null

/**
 * One browser process, reused; a fresh *context* per scrape. Contexts are the
 * isolation boundary — cookies, storage and cache never cross between students.
 */
async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  return browser
}

export async function closeBrowser(): Promise<void> {
  await browser?.close()
  browser = null
}

/**
 * What the schedule page says about the student, above the table.
 *
 * Worth capturing because it is the only place OneTUP can learn a student's
 * real name and program without asking them to type it: the sign-up form only
 * knows what they chose to enter. It is also what makes class-representative
 * verification possible.
 */
export interface StudentIdentity {
  fullName: string | null
  studentNumber: string | null
  programName: string | null
  termLabel: string | null
}

export interface ScrapeResult extends ScheduleParseResult {
  parserVersion: string
  identity: StudentIdentity
}

export interface GradeScrapeResult extends GradeParseResult {
  /**
   * The raw rows, exactly as they came off the page.
   *
   * This exists because nobody has ever seen the markup of `grades.php`. The
   * parser below is written from the shape the data plausibly has, and the
   * first real import is the only way to find out whether that was right — so
   * the rows travel back with the result, where the student who ran the import
   * (and only they) can see what the reader was working from. Never logged,
   * never stored. Delete this field once the layout is confirmed.
   */
  debugRows: string[][]
  /** Which selector actually found rows, for the same reason. */
  debugSelector: string
  /** Present only when no rows were found at all. See `PageDiagnostic`. */
  diagnostic: PageDiagnostic | null
  /**
   * Who the portal says we signed in as.
   *
   * Read here as well as on the schedule page for one reason: it is the only
   * evidence of *whose* record this is. A student can type any student number
   * into the import form, and without this the grades of one account could be
   * committed into another account's profile. The web app refuses the import
   * when this does not match the signed-in student.
   */
  identity: StudentIdentity
}

/**
 * What a scrape does once it is signed in.
 *
 * Splitting this from the sign-in is not tidiness: the login sequence is three
 * separate workarounds for the portal's quirks, each of which cost real time to
 * find, and a second copy of it would drift from this one the first time the
 * portal changed.
 */
interface ScrapeJob<T> {
  /** Completes the "try again" sentence a student sees when this job fails. */
  advice: string
  read(page: Page, baseUrl: string): Promise<T>
  /**
   * Whether the session that produced this result is worth keeping.
   *
   * It exists because a read can now *succeed* while proving the session is
   * dead — the grades reader returns an empty result plus a description of the
   * sign-in page it was bounced to, rather than throwing. Without this, that
   * dead context was cached and handed to the next attempt, so every retry
   * began already signed out and failed identically. Defaults to keeping.
   */
  keepSession?(result: T): boolean
}

/**
 * The portal drops roughly one automated login in three, seemingly at random —
 * a click that never lands, a page that never settles. A student experiences
 * that as "it didn't work", so a transient failure is retried once with a fresh
 * context before it is reported.
 *
 * An authentication failure is never retried: the credentials are wrong, asking
 * again will not change that, and repeating it burns one of the three attempts
 * before the lockout that protects the portal from credential testing.
 */
async function retrying<T>(credentials: Credentials, job: ScrapeJob<T>): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await signedIn(credentials, job)
    } catch (error) {
      lastError = error
      /*
       * Neither of these is retried, and for the same reason: both mean the
       * sign-in did not take. `ERS_AUTH_FAILED` is the portal saying so out
       * loud. `ERS_SESSION_LOST` is it saying so quietly — we were bounced back
       * to the login page on the very next request — which is what a rejected
       * login looks like when the portal declines to print an error at all.
       * Trying again would spend a second of the three attempts before lockout
       * on credentials that have already been refused once.
       */
      if (
        error instanceof ScrapeError &&
        (error.code === 'ERS_AUTH_FAILED' || error.code === 'ERS_SESSION_LOST')
      ) {
        throw error
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  throw lastError instanceof ScrapeError
    ? lastError
    : new ScrapeError('ERS_UNAVAILABLE', `ERS isn't responding right now. ${job.advice}`)
}

export async function scrapeSchedule(credentials: Credentials): Promise<ScrapeResult> {
  return retrying(credentials, {
    advice: 'Try again in a bit, or paste your schedule.',
    read: readSchedule,
  })
}

/**
 * The grades page, and with it every past semester the student has a record of.
 *
 * Same session, same login, one more navigation — which is the entire reason
 * this was worth building: a student's GWA history is already sitting behind
 * the credentials they hand over for a schedule import.
 */
export async function scrapeGrades(credentials: Credentials): Promise<GradeScrapeResult> {
  return retrying(credentials, {
    advice: 'Try again in a bit, or enter your past grades by hand.',
    read: readGrades,
    // A read that came back with a page description came back from somewhere
    // it should not have been. Keeping that session guarantees the next
    // attempt fails the same way.
    keepSession: (result) => result.diagnostic === null,
  })
}

/**
 * Both pages, on one sign-in.
 *
 * The portal allows one live session per student, so signing in twice to read
 * two pages is not merely wasteful — the second login ends the first session,
 * and from the portal's side it looks like credential testing. A student who is
 * asked for their password once should have it used once.
 *
 * The grades half is allowed to fail on its own, and that asymmetry is the whole
 * point of this function. A student handing over their password during
 * onboarding came for a schedule; losing four years of GWA history to a moved
 * grades page is a disappointment they can fix later from the GWA screen, but
 * losing the schedule to it is a failed first run.
 */
export interface ScrapeAllResult {
  schedule: ScrapeResult
  /** Null when the grades page could not be read at all. */
  grades: GradeScrapeResult | null
  /** Why it could not, in the words the student would have been shown. */
  gradesError: { code: ScrapeErrorCode; message: string } | null
}

export async function scrapeAll(credentials: Credentials): Promise<ScrapeAllResult> {
  return retrying(credentials, {
    advice: 'Try again in a bit, or paste your schedule.',
    async read(page, baseUrl) {
      /* Schedule first, and not only because it is the thing that must not be
       * lost: `readGrades` asks for its page over HTTP with the current URL as
       * the referer, so it wants to be standing on an ordinary signed-in page
       * when it runs, which is exactly where a finished schedule read leaves us. */
      const schedule = await readSchedule(page, baseUrl)

      try {
        return { schedule, grades: await readGrades(page, baseUrl), gradesError: null }
      } catch (error) {
        return {
          schedule,
          grades: null,
          gradesError:
            error instanceof ScrapeError
              ? { code: error.code, message: error.message }
              : {
                  code: 'ERS_UNAVAILABLE' as const,
                  message:
                    "We read your schedule, but ERS didn't hand over the grades page. You can bring your past grades in later from the GWA screen.",
                },
        }
      }
    },
    /* The grades job's rule, for the grades job's reason: a read that came back
     * describing a page came back from somewhere it should not have been, and
     * caching that session guarantees the next attempt fails identically. A
     * grades read that threw says the same thing less politely. */
    keepSession: (result) => result.gradesError === null && result.grades?.diagnostic === null,
  })
}

function portalBaseUrl(): string {
  return (process.env.ERS_BASE_URL ?? 'https://ers.tup.edu.ph/aims/students/').replace(/\/?$/, '/')
}

/**
 * A signed-in session, kept warm between requests.
 *
 * The portal appears to allow one live session per student: a second sign-in
 * invalidates the first. That makes repeated logins actively harmful rather
 * than merely wasteful — importing a schedule and then importing grades signs
 * in twice, and the second login can pull the rug from under a session the
 * student themselves is using in their own browser. It also looks, from the
 * portal's side, exactly like credential testing.
 *
 * So a session that worked is held open for a few minutes and reused. Three
 * rules keep that honest:
 *
 *   1. Memory only. Never written to disk, never logged, and gone when the
 *      process restarts. A session cookie is a bearer token for somebody's
 *      student record, and ADR-004's "nothing at rest" has to keep meaning what
 *      it says.
 *   2. Keyed by a hash of the student number, never the password. The password
 *      is used once at sign-in and is not retained here either.
 *   3. Short-lived and evicted eagerly — on TTL, on any read failure, and on
 *      the first sign that the portal has ended it.
 */
interface CachedSession {
  key: string
  context: BrowserContext
  page: Page
  expiresAt: number
  /** One request at a time per session: two jobs sharing one page interleave
   * navigations and read each other's half-loaded documents. */
  busy: boolean
}

const SESSIONS = new Map<string, CachedSession>()

/** Conservative against a portal whose real idle timeout nobody has measured.
 * Long enough that schedule-then-grades is one login; short enough that a
 * forgotten session is not left open for an hour. */
const SESSION_TTL_MS = Number(process.env.ERS_SESSION_TTL_MS ?? 10 * 60_000)
const SESSION_LIMIT = Number(process.env.ERS_SESSION_LIMIT ?? 20)
const SESSION_REUSE = process.env.ERS_SESSION_REUSE !== '0'

/** The student number, hashed. Enough to tell sessions apart, not enough to
 * read one out of a heap dump. */
function sessionKey(credentials: Credentials): string {
  return createHash('sha256')
    .update(`${portalBaseUrl()}|${credentials.studentNumber}`)
    .digest('hex')
}

async function disposeSession(session: CachedSession): Promise<void> {
  SESSIONS.delete(session.key)
  await session.context.close().catch(() => undefined)
}

/** Claims a live session for this request, or nothing. Expired and in-use
 * sessions are never handed out. */
function claimSession(key: string): CachedSession | null {
  const session = SESSIONS.get(key)
  if (!session) return null
  if (session.busy) return null
  if (session.expiresAt <= Date.now()) {
    void disposeSession(session)
    return null
  }
  session.busy = true
  return session
}

function releaseSession(session: CachedSession): void {
  session.busy = false
  session.expiresAt = Date.now() + SESSION_TTL_MS
}

/** Closes everything: called on shutdown, and when the cache is over its cap. */
export function openSessionCount(): number {
  return SESSIONS.size
}

export async function closeSessions(): Promise<void> {
  const open = [...SESSIONS.values()]
  SESSIONS.clear()
  await Promise.all(open.map((session) => session.context.close().catch(() => undefined)))
}

async function evictExpired(): Promise<void> {
  const now = Date.now()
  for (const session of [...SESSIONS.values()]) {
    if (!session.busy && session.expiresAt <= now) await disposeSession(session)
  }
  // A hard cap, because each held session is a live browser context and a live
  // session on somebody's student record.
  while (SESSIONS.size > SESSION_LIMIT) {
    const oldest = [...SESSIONS.values()].filter((s) => !s.busy).sort((a, b) => a.expiresAt - b.expiresAt)[0]
    if (!oldest) break
    await disposeSession(oldest)
  }
}

/**
 * Runs a job on a signed-in page, signing in only if there is no usable session.
 *
 * A cached session that has been ended by the portal surfaces as
 * `ERS_SESSION_LOST` from the read; that is the one case worth a second attempt,
 * because a session existing at all means these credentials were accepted
 * recently, so a fresh sign-in cannot be the wrong-password case that risks
 * lockout.
 */
async function signedIn<T>(credentials: Credentials, job: ScrapeJob<T>): Promise<T> {
  const key = sessionKey(credentials)

  if (SESSION_REUSE) {
    const cached = claimSession(key)
    if (cached) {
      try {
        return await job.read(cached.page, portalBaseUrl())
      } catch (error) {
        await disposeSession(cached)
        const ended = error instanceof ScrapeError && error.code === 'ERS_SESSION_LOST'
        if (!ended) throw error
        // Fall through and sign in again. The portal ended it, not the student.
      }
    }
  }

  return freshSession(credentials, job, key)
}

/** Signs in from nothing, and — unless reuse is off — keeps the session. */
async function freshSession<T>(
  credentials: Credentials,
  job: ScrapeJob<T>,
  key: string,
): Promise<T> {
  const baseUrl = portalBaseUrl()

  let context: BrowserContext | null = null
  let keep = false

  try {
    await evictExpired()
    const instance = await getBrowser()
    context = await instance.newContext({
      // Images are the bulk of the page weight and none of the signal.
      serviceWorkers: 'block',
      javaScriptEnabled: true,
      viewport: { width: 1440, height: 900 },
      locale: 'en-PH',
      timezoneId: 'Asia/Manila',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    })

    // `navigator.webdriver` is the most common automation tell. We are acting
    // for the student, on their own account, with their consent — but a portal
    // that refuses headless browsers refuses this legitimate use with it.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', (route) => route.abort())

    const page = await context.newPage()
    page.setDefaultTimeout(SCRAPER_CONFIG.timeouts.selector)

    const loginUrl = new URL(SCRAPER_CONFIG.loginPath, baseUrl).href
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_CONFIG.timeouts.navigation,
    })

    await page.waitForSelector(SCRAPER_CONFIG.selectors.studentNumber)

    // Typed, not filled. The portal rejects a login whose fields were assigned
    // programmatically — `page.fill()` sets `value` without producing the key
    // events the page listens for, and the result is indistinguishable from a
    // wrong password. This cost an hour to find; do not "simplify" it back.
    await page.click(SCRAPER_CONFIG.selectors.studentNumber)
    await page.type(SCRAPER_CONFIG.selectors.studentNumber, credentials.studentNumber, {
      delay: TYPING_DELAY_MS,
    })
    await page.click(SCRAPER_CONFIG.selectors.password)
    await page.type(SCRAPER_CONFIG.selectors.password, credentials.password, {
      delay: TYPING_DELAY_MS,
    })

    await setBirthdate(page, toPortalBirthdate(credentials.birthdate))

    await page.click(SCRAPER_CONFIG.selectors.submit)

    /*
     * Wait for an actual outcome rather than for a fixed interval.
     *
     * A timed wait is what produced the worst failure this scraper had: the
     * page had not finished navigating when we looked, the login form was still
     * on screen, and a student with perfectly good credentials was told their
     * password was wrong — and charged one of the three attempts before lockout.
     *
     * The portal leaves the URL unchanged either way, so the two real signals
     * are the form detaching (success) and the error text appearing (rejection).
     */
    /*
     * Wait for the submission to land, then ask the resulting document whether
     * we are still looking at a sign-in form.
     *
     * The previous version watched for the form element to *detach* and treated
     * that as success. It is not: a rejected login re-renders the same page, and
     * a re-render detaches the old node just as thoroughly as a successful
     * navigation does. So every failed sign-in was read as a successful one, and
     * the scrape carried on to request a grades page it had no session for —
     * which the portal answered with the sign-in page, which contains no table,
     * which we then reported to the student as "your grades may not be posted
     * yet". A wrong password came back as a statement about their academic
     * record.
     *
     * Presence in the settled document is the honest signal. It cannot be faked
     * by a re-render, and it is the same question a human answers by looking.
     */
    await Promise.race([
      page.waitForURL((url) => !url.href.includes(SCRAPER_CONFIG.loginPath), {
        timeout: SCRAPER_CONFIG.timeouts.selector,
      }),
      page.waitForFunction(() => !document.querySelector('form[name="frmLogin"]'), {
        timeout: SCRAPER_CONFIG.timeouts.selector,
      }),
    ]).catch(() => undefined)

    // The portal announces failures through a `noty` toast raised by script, so
    // the document has to be given a moment to settle before it is questioned.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined)

    const signIn = await page
      .evaluate(() => ({
        stillHere: Boolean(document.querySelector('form[name="frmLogin"]')),
        text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
      }))
      .catch(() => ({ stillHere: false, text: '' }))

    if (signIn.stillHere) {
      /* Still on the sign-in page after the POST settled. The portal's own
       * wording varies — and is sometimes only a toast that has already faded —
       * so anything it did say is passed through rather than guessed at. */
      const reason = /invalid|incorrect|not found|no record|locked|attempt/i.exec(signIn.text)
      throw new ScrapeError(
        'ERS_AUTH_FAILED',
        /* The portal gives the same "Invalid credentials" for a wrong password
         * and a wrong birthdate, so the hint is attached either way — it is the
         * one thing a student is most likely to have entered differently from
         * the record, and the message alone never tells them that. */
        reason
          ? `ERS turned the sign-in down. It said: "${firstSentence(reason.input.slice(reason.index))}" — check the password, and check that the birthdate matches your ERS record exactly.`
          : "ERS didn't accept those details. Check the password and the birthdate — the birthdate has to match your record exactly.",
      )
    }

    const result = await job.read(page, baseUrl)

    /* Held open only after a read that worked. A session kept after a failure
     * is a session we have no evidence is usable, and the next request would
     * spend its one reuse attempt discovering that. */
    if (SESSION_REUSE && context && (job.keepSession?.(result) ?? true)) {
      SESSIONS.set(key, {
        key,
        context,
        page,
        expiresAt: Date.now() + SESSION_TTL_MS,
        busy: false,
      })
      keep = true
    }

    return result
  } catch (error) {
    if (error instanceof ScrapeError) throw error
    if (error instanceof Error && /timeout/i.test(error.message)) {
      throw new ScrapeError('ERS_TIMEOUT', `That took too long. ${job.advice}`)
    }
    throw new ScrapeError('ERS_UNAVAILABLE', `ERS isn't responding right now. ${job.advice}`)
  } finally {
    // Destroyed unless it was handed to the cache: a leaked context is a leaked
    // session, and an uncached one has nobody left to close it.
    if (!keep) await context?.close().catch(() => undefined)
  }
}

/** Navigates to a page and returns its table rows, however they are marked up. */
/**
 * Confirms the page in front of us still belongs to a signed-in session.
 *
 * The sign-in form is the tell, and it is checked against the live document
 * rather than a remembered state: whatever the portal did a second ago, this is
 * what it is showing now.
 */
async function assertStillSignedIn(page: Page): Promise<void> {
  const onSignIn = await page
    .evaluate(() => Boolean(document.querySelector('form[name="frmLogin"]')))
    .catch(() => false)

  if (!onSignIn) return

  throw new ScrapeError(
    'ERS_SESSION_LOST',
    'ERS put us back on the sign-in page before the record could be read. It allows one ' +
      'session at a time, so this usually means the account was signed in somewhere else — ' +
      'close ERS in your own browser, then try again.',
  )
}

/**
 * The signed-in page we start from, and the navigation it offers.
 *
 * Captured before any page is requested, because it is the only chance to see
 * how the portal wants to be asked. When a direct URL is bounced back to
 * sign-in, the answer is almost always sitting in this menu — a different
 * `mainID`, a query string we did not send, or a link that is not a link at all.
 */
async function describeLanding(page: Page): Promise<LandingInfo> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)

  const links = await page
    .$$eval('a[href]', (nodes) =>
      nodes
        .map((node) => ({
          href: (node as HTMLAnchorElement).getAttribute('href') ?? '',
          text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        }))
        .filter((link) => link.href && !link.href.toLowerCase().startsWith('javascript:'))
        .slice(0, 60),
    )
    .catch(() => [] as { href: string; text: string }[])

  const title = await page.title().catch(() => '')

  return {
    url: page.url(),
    title,
    links,
    gradesHref:
      links.find((link) => /grade/i.test(link.href) || /grade/i.test(link.text))?.href ?? null,
  }
}

/** The portal's message, without the page furniture that follows it. */
function firstSentence(text: string): string {
  const end = text.search(/[.!?](\s|$)/)
  return (end === -1 ? text.slice(0, 90) : text.slice(0, end + 1)).trim()
}

async function tableRows(
  page: Page,
  baseUrl: string,
  path: string,
  trail: string[] = [],
  ladder: readonly string[] = SCRAPER_CONFIG.selectors.rowLadder,
): Promise<{ rows: string[][]; selector: string }> {
  trail.push(page.url())
  await navigateTo(page, baseUrl, path)
  trail.push(page.url())

  /*
   * Landing back on the sign-in form means the session did not survive the hop,
   * and the page we asked for was never rendered. Without this check that came
   * back as "your grades page is empty" — which is a lie about the student's
   * record, and the single most misleading thing this scraper could say. The
   * portal answers an unauthenticated request with a 302 to `index.php`, so
   * this is the normal shape of the failure, not an exotic one.
   */
  await assertStillSignedIn(page)

  // The table is populated after DOMContentLoaded, so reading immediately
  // finds an empty page and reports a record that does not exist.
  await page
    .waitForSelector(SCRAPER_CONFIG.selectors.row, { timeout: SCRAPER_CONFIG.timeouts.selector })
    .catch(() => undefined)

  /*
   * The portal ships jQuery and a progress bar, which is the signature of a
   * table that arrives by XHR after the document does. `domcontentloaded` is
   * therefore the wrong moment to look, and the fixed selector wait above only
   * helps when the row markup matches what we expected. So: let the network go
   * quiet, then look repeatedly for a few seconds before concluding there is
   * nothing there. Concluding it wrongly means telling a student their grades
   * are not posted, which is a claim we have no business making cheaply.
   */
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined)

  for (let attempt = 0; attempt < 4; attempt++) {
    trail.push(page.url())
    /* Checked on every pass, not just once after the navigation.
     *
     * The bounce back to sign-in is not always an HTTP redirect that `goto`
     * resolves on — the portal can serve the page and move you afterwards, from
     * script. Checking only on arrival therefore inspected a document that was
     * about to be replaced, passed it, and then read the sign-in page as an
     * empty grades page. Asking again on each pass is what catches the late
     * bounce.
     */
    await assertStillSignedIn(page)

    const found = await findRows(page, ladder)
    if (found) return found
    await page.waitForTimeout(1_200)
  }

  /* One last look before giving up.
   *
   * The bounce back to sign-in can land after the final check inside the loop,
   * and then nothing catches it: the loop simply runs out, we report zero rows,
   * and the page we describe afterwards is the sign-in page — with `bounced`
   * still false, which is precisely the misleading combination this is here to
   * prevent. */
  trail.push(page.url())
  await assertStillSignedIn(page)

  return { rows: [], selector: ladder[0] }
}

/**
 * Reaches a page the way the portal expects to be asked.
 *
 * The sidebar link is preferred over a typed URL for one reason: a session-bound
 * PHP app of this vintage often tracks which menu item you are "on", and a
 * request that arrives with no referer for a `mainID` the server did not just
 * hand out is exactly the kind of thing that gets answered with a redirect to
 * the login page. Clicking the link the portal itself rendered asks the
 * question in the form it expects.
 *
 * The typed URL stays as the fallback, because the link is only there once we
 * are already somewhere sensible.
 */
async function navigateTo(page: Page, baseUrl: string, path: string): Promise<void> {
  const target = new URL(path, baseUrl)
  const file = target.pathname.split('/').pop() ?? ''

  /*
   * The portal's own link first, and properly waited on.
   *
   * The earlier version raced the click against `waitForLoadState`, which
   * resolves immediately when the current document is already loaded — so it
   * never waited for the new page at all and always fell through to the typed
   * URL. Clicking the link the portal rendered is the request it expects; a
   * typed URL for a `mainID` it did not just hand out is the request it answers
   * by putting you back on the sign-in page.
   */
  if (file) {
    const link = await page.$(`a[href*="${file}"]`)
    if (link) {
      const navigated = await Promise.all([
        page
          .waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: SCRAPER_CONFIG.timeouts.navigation,
          })
          .then(() => true)
          .catch(() => false),
        link.click().catch(() => undefined),
      ])
      if (navigated[0] && page.url().includes(file)) return
    }
  }

  await page.goto(target.href, {
    waitUntil: 'domcontentloaded',
    timeout: SCRAPER_CONFIG.timeouts.navigation,
  })
}

/**
 * Rows from whichever frame and selector actually has them.
 *
 * Every frame, not just the top one: an `iframe` is invisible to
 * `page.$$eval`, and a grades table inside one would come back as "this student
 * has no grades". The selector ladder narrows from the portal's own convention
 * to pure shape, and a row needs two cells to count — which is what stops a
 * layout table's outer shell being mistaken for data.
 */
async function findRows(
  page: Page,
  ladder: readonly string[] = SCRAPER_CONFIG.selectors.rowLadder,
): Promise<{ rows: string[][]; selector: string } | null> {
  for (const scope of [page, ...page.frames()]) {
    for (const selector of ladder) {
      const rows = await extractRows(scope, selector).catch(() => [] as string[][])
      if (rows.filter((cells) => cells.length >= 2).length > 0) {
        return { rows, selector }
      }
    }
  }
  return null
}

/**
 * What the page looked like when we found nothing on it.
 *
 * This exists because "the grades page came back empty" is a claim we cannot
 * actually support: it means our reader found no rows, which is a statement
 * about our reader. Everything here is gathered to tell the two apart on the
 * next attempt — is it an iframe, is it not a table at all, is there a term
 * dropdown we never touched, did we land somewhere else entirely.
 *
 * It travels back to the student who ran the import and nowhere else. It is
 * never logged and never stored: on a grades page, the markup *is* the grades.
 */
export interface LandingInfo {
  url: string
  title: string
  /** The portal's own navigation, as hrefs and labels. This is the thing worth
   * knowing: it says how the portal expects its pages to be asked for. */
  links: { href: string; text: string }[]
  /** Whether that navigation offers a grades page at all, and under what URL. */
  gradesHref: string | null
}

export interface PageDiagnostic {
  url: string
  title: string
  /** Every URL the page sat on, in order. A late client-side bounce is
   * invisible in a single final reading and obvious in a trail. */
  trail?: string[]
  /** Where we were standing, signed in, before the page below was requested. */
  landing?: LandingInfo | null
  /** True when the portal moved us back to sign-in during the request. */
  bounced?: boolean
  /** The URL we asked for, which may not be the URL we ended up on. */
  requested?: string
  counts: {
    tables: number
    rows: number
    cells: number
    iframes: number
    forms: number
    selects: number
    buttons: number
  }
  /** Frame URLs, so a nested document announces itself. */
  frames: string[]
  headings: string[]
  /** Names of any dropdowns — a term picker would be the obvious missing step. */
  selectNames: string[]
  textSample: string
  htmlSample: string
}

const DIAGNOSTIC_TEXT_LIMIT = 1500
const DIAGNOSTIC_HTML_LIMIT = 4000

async function describePage(page: Page): Promise<PageDiagnostic> {
  const frames = page.frames().map((frame) => frame.url())

  const detail = await page
    .evaluate(
      ({ textLimit, htmlLimit }) => ({
        url: location.href,
        title: document.title,
        counts: {
          tables: document.querySelectorAll('table').length,
          rows: document.querySelectorAll('tr').length,
          cells: document.querySelectorAll('td, th').length,
          iframes: document.querySelectorAll('iframe, frame').length,
          forms: document.querySelectorAll('form').length,
          selects: document.querySelectorAll('select').length,
          buttons: document.querySelectorAll('button, input[type="submit"]').length,
        },
        headings: Array.from(document.querySelectorAll('h1, h2, h3, legend, caption'))
          .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 12),
        selectNames: Array.from(document.querySelectorAll('select'))
          .map((node) => node.getAttribute('name') ?? node.id ?? '(unnamed)')
          .slice(0, 8),
        textSample: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, textLimit),
        htmlSample: (document.body?.innerHTML ?? '').slice(0, htmlLimit),
      }),
      { textLimit: DIAGNOSTIC_TEXT_LIMIT, htmlLimit: DIAGNOSTIC_HTML_LIMIT },
    )
    .catch(() => null)

  return {
    url: detail?.url ?? page.url(),
    title: detail?.title ?? '',
    counts: detail?.counts ?? {
      tables: 0,
      rows: 0,
      cells: 0,
      iframes: 0,
      forms: 0,
      selects: 0,
      buttons: 0,
    },
    frames,
    headings: detail?.headings ?? [],
    selectNames: detail?.selectNames ?? [],
    textSample: detail?.textSample ?? '',
    htmlSample: detail?.htmlSample ?? '',
  }
}

async function readSchedule(page: Page, baseUrl: string): Promise<ScrapeResult> {
  const { rows } = await tableRows(page, baseUrl, SCRAPER_CONFIG.schedulePath)

  if (rows.length === 0) {
    throw new ScrapeError(
      'SCHEDULE_NOT_FOUND',
      "We got in, but couldn't find a schedule. You may not be enrolled yet this term.",
    )
  }

  // Header rows and spacers come back with too few cells; the parser flags
  // them rather than throwing, and they are dropped here.
  const dataRows = rows.filter((cells) => cells.length >= DEFAULT_PARSER_CONFIG.minimumCells)

  if (dataRows.length === 0) {
    throw new ScrapeError(
      'SCHEDULE_PARSE_FAILED',
      "We reached your schedule page but couldn't read any rows from it.",
    )
  }

  const parsed = parseScheduleTable(dataRows)
  return {
    ...parsed,
    parserVersion: SCRAPER_CONFIG.version,
    identity: await readIdentity(page),
  }
}

/** How many raw rows travel back for inspection. See `GradeScrapeResult`. */
const DEBUG_ROW_LIMIT = 40

/**
 * Rows read from HTML we were handed, rather than from a page we are standing on.
 *
 * The grades page is served correctly and then takes itself away: the trail
 * from a real import reads `schedule.php` → `grades.php` → the sign-in page,
 * with a valid session throughout. Something on that page moves the browser
 * afterwards. Fighting that with waits and retries is a race we do not need to
 * enter, because the response body has already arrived — the document with the
 * grades in it is in hand before anything redirects.
 *
 * So the bytes are replayed into a throwaway context with JavaScript switched
 * off, where nothing can navigate, and read with the same selectors as any
 * other page. Scripts cannot run, so this cannot be redirected, and no request
 * of any kind leaves the machine.
 */
async function rowsFromHtml(
  html: string,
  ladder: readonly string[] = SCRAPER_CONFIG.selectors.rowLadder,
): Promise<{ rows: string[][]; selector: string } | null> {
  if (!html.trim()) return null

  const instance = await getBrowser()
  const context = await instance.newContext({ javaScriptEnabled: false })

  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    return await findRows(page, ladder)
  } catch {
    return null
  } finally {
    await context.close().catch(() => undefined)
  }
}

/**
 * Watches for the document response of a specific page and keeps its body.
 *
 * Returns a reader for the captured HTML and a function that detaches the
 * listener — never left attached, because a page outlives one navigation and a
 * listener that accumulates response bodies is a memory leak with a student's
 * academic record in it.
 */
function captureDocument(page: Page, match: string): { html(): string; stop(): void } {
  let captured = ''

  const onResponse = (response: import('playwright').Response) => {
    if (!response.url().includes(match)) return
    if (response.request().resourceType() !== 'document') return
    void response
      .text()
      .then((body) => {
        // The last one wins: a redirect chain ends on the page we want.
        if (body.trim()) captured = body
      })
      .catch(() => undefined)
  }

  page.on('response', onResponse)

  return {
    html: () => captured,
    stop: () => page.off('response', onResponse),
  }
}

async function readGrades(page: Page, baseUrl: string): Promise<GradeScrapeResult> {
  // Read while we are still standing on it, signed in.
  const landing = await describeLanding(page)
  const requested = new URL(SCRAPER_CONFIG.gradesPath, baseUrl).href

  let rows: string[][] = []
  let selector: string = SCRAPER_CONFIG.selectors.rowLadder[0]
  let bounced = false
  const trail: string[] = []

  /*
   * Asked for over HTTP, not by moving the browser.
   *
   * The trail from a real import reads schedule.php → grades.php → the sign-in
   * page: the server answers correctly and the *page* is then taken somewhere
   * else. Navigating was never necessary to get the document — only to get
   * redirected. `context.request` shares this context's cookies, so this is the
   * same authenticated GET the browser would make, minus a browser for anything
   * to redirect. The session on schedule.php is left standing.
   */
  const fetched = await page
    .context()
    .request.get(requested, { headers: { referer: page.url() }, timeout: SCRAPER_CONFIG.timeouts.navigation })
    .then((response) => (response.ok() ? response.text() : ''))
    .catch(() => '')

  if (fetched) {
    const direct = await rowsFromHtml(fetched, SCRAPER_CONFIG.selectors.contextRowLadder)
    if (direct && direct.rows.length > 0) {
      const parsed = parseGradeTable(direct.rows)
      return {
        ...parsed,
        parserVersion: GRADE_PARSER_VERSION,
        debugRows: direct.rows.slice(0, DEBUG_ROW_LIMIT),
        debugSelector: direct.selector,
        diagnostic: null,
        identity: await readIdentity(page),
      }
    }
  }

  // Only if the plain request came back with nothing usable: walk there, and
  // keep whatever the response held even if the page is taken away mid-read.
  const document = captureDocument(page, 'grades.php')

  try {
    ;({ rows, selector } = await tableRows(
      page,
      baseUrl,
      SCRAPER_CONFIG.gradesPath,
      trail,
      SCRAPER_CONFIG.selectors.contextRowLadder,
    ))
  } catch (error) {
    /*
     * A bounce back to sign-in stops being fatal here.
     *
     * Failing outright told the student their session was taken elsewhere,
     * which is only one of the explanations and — when they were signed out
     * everywhere — the wrong one. The others are all about how the page was
     * asked for, and the portal's own menu is where that answer lives. So the
     * bounce is recorded and the menu comes back with it, rather than being
     * thrown away with the error.
     */
    if (!(error instanceof ScrapeError && error.code === 'ERS_SESSION_LOST')) throw error
    bounced = true
  } finally {
    document.stop()
  }

  /* Whatever the browser ended up showing, the server already answered. If the
   * live page gave us nothing — because it redirected itself away, or because
   * it was replaced before it could be read — the response it sent is still
   * here, and it is the same document either way. */
  if (rows.length === 0) {
    const replayed = await rowsFromHtml(
      document.html(),
      SCRAPER_CONFIG.selectors.contextRowLadder,
    )
    if (replayed && replayed.rows.length > 0) {
      rows = replayed.rows
      selector = `${replayed.selector} (from the response, not the live page)`
      bounced = false
    }
  }

  /*
   * No rows is not an error, and it is certainly not "you have no grades".
   *
   * It used to throw exactly that, which was a confident claim about a
   * student's academic record made on the evidence of our own reader finding
   * nothing — and it threw *before* the debug rows were attached, so the one
   * case where the raw page mattered most was the one case that discarded it.
   *
   * Now the page describes itself and the description travels back with the
   * empty result. The review screen shows it; nothing is written either way.
   */
  const diagnostic =
    rows.length === 0
      ? { ...(await describePage(page)), landing, bounced, requested, trail }
      : null

  // Every row goes to the parser, short ones included: a semester heading is a
  // one-cell row, and dropping it would strand every grade beneath it.
  const parsed = parseGradeTable(rows)

  // A parse that read nothing is deliberately *not* an error. That is the case
  // where the rows below are worth the most — the page came back, we simply did
  // not recognise it — and throwing here would discard the only evidence of
  // what it actually looks like. The parser has already put a plain sentence in
  // `warnings`, and the review screen shows it with the rows underneath.
  return {
    ...parsed,
    parserVersion: GRADE_PARSER_VERSION,
    debugRows: rows.slice(0, DEBUG_ROW_LIMIT),
    debugSelector: selector,
    diagnostic,
    identity: await readIdentity(page),
  }
}

/**
 * The birthdate field is `readonly` and driven by a jQuery UI datepicker, so
 * assigning `value` alone leaves the widget's own state unsatisfied and the form
 * rejects with the same message a wrong password gives. Removing the attribute,
 * assigning, then firing input, change and blur is what makes its handlers run.
 *
 * The value must already be in the portal's `mm/dd/yy` format — see
 * `toPortalBirthdate`. This is the single most fragile step in the scrape.
 */
async function setBirthdate(page: import('playwright').Page, birthdate: string): Promise<void> {
  const selector = SCRAPER_CONFIG.selectors.birthdate
  const field = await page.$(selector)
  if (!field) return

  await page.evaluate(
    ({ sel, value }) => {
      const input = document.querySelector(sel) as HTMLInputElement | null
      if (!input) return
      input.removeAttribute('readonly')
      input.value = value
      for (const type of ['input', 'change', 'blur']) {
        input.dispatchEvent(new Event(type, { bubbles: true }))
      }
    },
    { sel: selector, value: birthdate },
  )
}


/** Reads a table's rows as arrays of cell text. */
async function extractRows(
  scope: import('playwright').Page | import('playwright').Frame,
  selector: string,
): Promise<string[][]> {
  return scope.$$eval(selector, (elements) =>
    elements.map((row) =>
      Array.from(row.querySelectorAll('td, th')).map((cell: Element) =>
        (cell.textContent ?? '')
          // The portal emits non-breaking spaces inside its table cells.
          .replace(/ /g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    ),
  )
}

/**
 * Reads the header the portal prints above the table:
 *
 *   Welcome, DELA CRUZ, JUAN SANTOS (TUPM-00-0000)
 *   Bachelor of Science in Computer Science
 *   Term/Sem: 1st  SY: 2026-2027
 *
 * Every field is optional. A header that changes shape must degrade to nulls,
 * never to a failed import — the schedule is the thing the student came for.
 */
async function readIdentity(page: import('playwright').Page): Promise<StudentIdentity> {
  const text = await page
    .evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    .catch(() => '')

  const welcome = /Welcome,\s*([^(]{3,90}?)\s*\(([A-Z]{2,6}-?\d{2}-?\d{3,5})\)/i.exec(text)
  const program = /\b((?:Bachelor|Master|Doctor)[^|]{5,80}?)(?=\s*Term\/Sem|\s*$)/i.exec(text)
  // "Term/Sem: 1st SY: 2026-2027" runs straight into the table header, so the
  // boundary is the first column name rather than the end of the line.
  const term = /Term\/Sem:\s*(.{1,44}?)\s*(?=#\s|Subject Code|$)/i.exec(text)

  return {
    fullName: welcome?.[1]?.trim() || null,
    studentNumber: welcome?.[2]?.trim() || null,
    programName: program?.[1]?.trim() || null,
    termLabel: term?.[1]?.trim() || null,
  }
}
