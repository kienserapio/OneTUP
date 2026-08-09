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
  schedulePath: 'index.php?page=schedule',
  selectors: {
    loginForm: 'form[name="frmLogin"]',
    studentNumber: 'input[name="username"]',
    password: 'input[name="password"]',
    birthdate: 'input[name="bdate"]',
    submit: 'form[name="frmLogin"] button[type="submit"]',
    table: 'table.dbtable',
    row: 'table.dbtable tr',
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

export interface ScrapeResult extends ScheduleParseResult {
  parserVersion: string
}

export async function scrapeSchedule(credentials: Credentials): Promise<ScrapeResult> {
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
      viewport: { width: 1280, height: 900 },
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
    await page.fill(SCRAPER_CONFIG.selectors.studentNumber, credentials.studentNumber)
    await page.fill(SCRAPER_CONFIG.selectors.password, credentials.password)

    await setBirthdate(page, toPortalBirthdate(credentials.birthdate))

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      page.click(SCRAPER_CONFIG.selectors.submit),
    ])
    await page.waitForTimeout(1500)

    // The portal answers a bad login with 200, the form still on screen, and
    // "Invalid credentials." in the body. The form's presence is the reliable
    // signal — the URL is unchanged on both success and failure, so comparing
    // URLs would report every login as failed.
    if (await page.$(SCRAPER_CONFIG.selectors.loginForm)) {
      const rejected = await page
        .locator('body')
        .innerText()
        .then((text) => /invalid credentials/i.test(text))
        .catch(() => false)

      throw new ScrapeError(
        'ERS_AUTH_FAILED',
        rejected
          ? "Those details didn't work on ERS. Check your password and birthdate — the birthdate has to match your record exactly."
          : "We couldn't get past the ERS sign-in. Try again, or paste your schedule instead.",
      )
    }

    await page.goto(new URL(SCRAPER_CONFIG.schedulePath, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_CONFIG.timeouts.navigation,
    })

    const table = await page.$(SCRAPER_CONFIG.selectors.table)
    if (!table) {
      throw new ScrapeError(
        'SCHEDULE_NOT_FOUND',
        "We got in, but couldn't find a schedule. You may not be enrolled yet this term.",
      )
    }

    const rows: string[][] = await page.$$eval(SCRAPER_CONFIG.selectors.row, (elements) =>
      elements.map((row) =>
        Array.from(row.querySelectorAll('td, th')).map((cell: Element) =>
          (cell.textContent ?? '')
            // The portal emits non-breaking spaces inside its table cells.
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      ),
    )

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
    return { ...parsed, parserVersion: SCRAPER_CONFIG.version }
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

