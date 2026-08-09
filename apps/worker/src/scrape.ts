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
    studentNumber: 'input[name="studno"], input[name="student_no"], #studno',
    password: 'input[type="password"]',
    birthdate: 'input[name="bdate"], input[name="birthdate"], #bdate',
    submit: 'input[type="submit"], button[type="submit"]',
    table: 'table.dbtable',
    row: 'table.dbtable tr',
  },
  timeouts: {
    navigation: 25_000,
    selector: 15_000,
  },
} as const

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

    await setBirthdate(page, credentials.birthdate)

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      page.click(SCRAPER_CONFIG.selectors.submit),
    ])
    await page.waitForTimeout(1200)

    // The portal returns 200 with the login form still on screen when the
    // credentials are wrong, so the URL is the only reliable signal.
    if (isStillOnLogin(page.url(), loginUrl)) {
      throw new ScrapeError(
        'ERS_AUTH_FAILED',
        "Those details didn't work on ERS. Check your password and birthdate — the birthdate has to match your record exactly.",
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
        Array.from(row.querySelectorAll('td, th')).map((cell) =>
          (cell.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(),
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
 * The birthdate field is readonly and driven by a datepicker widget, so setting
 * `value` alone leaves the widget's own validation unsatisfied and the form
 * silently rejects. Removing readonly, assigning, then firing input, change and
 * blur is what makes the widget's handlers run.
 *
 * This is the single most fragile step in the whole scrape.
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

function isStillOnLogin(currentUrl: string, loginUrl: string): boolean {
  const current = currentUrl.split('#')[0]
  const login = loginUrl.split('#')[0]
  if (current === login) return true
  // Some deployments bounce back with an error query rather than a new page.
  return /login|error=1|invalid/i.test(current) && current.startsWith(login.split('?')[0])
}
