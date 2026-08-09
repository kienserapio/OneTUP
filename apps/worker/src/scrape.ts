import { chromium, type Browser, type BrowserContext } from 'playwright'
import { DEFAULT_PARSER_CONFIG, parseScheduleTable, type ScheduleParseResult } from '@onetup/core'

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
  | 'SCHEDULE_NOT_FOUND'
  | 'SCHEDULE_PARSE_FAILED'

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
export async function scrapeSchedule(credentials: Credentials): Promise<ScrapeResult> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptScrape(credentials)
    } catch (error) {
      lastError = error
      if (error instanceof ScrapeError && error.code === 'ERS_AUTH_FAILED') throw error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  throw lastError instanceof ScrapeError
    ? lastError
    : new ScrapeError(
        'ERS_UNAVAILABLE',
        "ERS isn't responding right now. Try again in a bit, or paste your schedule.",
      )
}

async function attemptScrape(credentials: Credentials): Promise<ScrapeResult> {
  const baseUrl = (process.env.ERS_BASE_URL ?? 'https://ers.tup.edu.ph/aims/students/').replace(
    /\/?$/,
    '/',
  )

  let context: BrowserContext | null = null

  try {
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
    const outcome = await Promise.race([
      page
        .waitForSelector(SCRAPER_CONFIG.selectors.loginForm, {
          state: 'detached',
          timeout: SCRAPER_CONFIG.timeouts.selector,
        })
        .then(() => 'signed_in' as const),
      page
        .waitForFunction(() => /invalid credentials/i.test(document.body.innerText), {
          timeout: SCRAPER_CONFIG.timeouts.selector,
        })
        .then(() => 'rejected' as const),
    ]).catch(() => 'unknown' as const)

    if (outcome === 'rejected') {
      throw new ScrapeError(
        'ERS_AUTH_FAILED',
        "Those details didn't work on ERS. Check your password and birthdate — the birthdate has to match your record exactly.",
      )
    }

    // Neither signal arrived. That is our problem, not the student's, so it is
    // reported as an outage and retried rather than as a bad password.
    if (outcome === 'unknown' && (await page.$(SCRAPER_CONFIG.selectors.loginForm))) {
      throw new ScrapeError(
        'ERS_UNAVAILABLE',
        "We couldn't get past the ERS sign-in. Try again, or paste your schedule instead.",
      )
    }

    await page.goto(new URL(SCRAPER_CONFIG.schedulePath, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_CONFIG.timeouts.navigation,
    })

    // The table is populated after DOMContentLoaded, so reading immediately
    // finds an empty page and reports a schedule that does not exist.
    await page
      .waitForSelector(SCRAPER_CONFIG.selectors.row, { timeout: SCRAPER_CONFIG.timeouts.selector })
      .catch(() => undefined)

    let rows = await extractRows(page, SCRAPER_CONFIG.selectors.row)
    if (rows.length === 0) {
      // The bgcolor convention is the portal's, not a standard, so a layout
      // change should degrade to finding rows by shape rather than to failure.
      rows = await extractRows(page, SCRAPER_CONFIG.selectors.rowFallback)
    }

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
  } catch (error) {
    if (error instanceof ScrapeError) throw error
    if (error instanceof Error && /timeout/i.test(error.message)) {
      throw new ScrapeError('ERS_TIMEOUT', 'That took too long. Try again, or paste your schedule.')
    }
    throw new ScrapeError(
      'ERS_UNAVAILABLE',
      "ERS isn't responding right now. Try again in a bit, or paste your schedule.",
    )
  } finally {
    // Destroyed unconditionally: a leaked context is a leaked session.
    await context?.close().catch(() => undefined)
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
async function extractRows(page: import('playwright').Page, selector: string): Promise<string[][]> {
  return page.$$eval(selector, (elements) =>
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
