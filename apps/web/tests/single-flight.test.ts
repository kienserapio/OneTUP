import { describe, expect, it } from 'vitest'
import { singleFlight } from '@/lib/offline/single-flight'

/**
 * The guarantee: a call that arrives while the job is running is *deferred*,
 * never dropped.
 *
 * The bug this pins down is quiet. The sync engine reads its queue once per
 * run, so a dropped concurrent call means the work queued by that caller waits
 * for the next scheduled trigger — fifteen minutes, or the next time the app
 * comes to the foreground. Recording one flashcard review is two queued writes
 * in immediate succession, and only the first was reaching the server.
 */

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('singleFlight', () => {
  it('runs the job', async () => {
    let runs = 0
    const run = singleFlight(async () => { runs += 1 }, () => undefined)
    await run()
    expect(runs).toBe(1)
  })

  it('does not run two at once', async () => {
    let concurrent = 0
    let peak = 0
    let release: () => void = () => {}

    const run = singleFlight(
      async () => {
        concurrent += 1
        peak = Math.max(peak, concurrent)
        await new Promise<void>((resolve) => { release = resolve })
        concurrent -= 1
      },
      () => undefined,
    )

    const first = run()
    await settled()
    void run()
    await settled()

    expect(peak).toBe(1)
    release()
    await first
    await settled()
    await settled()
    expect(peak).toBe(1)
  })

  /** The whole point. */
  it('re-runs once for a call that arrived mid-run', async () => {
    let runs = 0
    let release: () => void = () => {}

    const run = singleFlight(
      async () => {
        runs += 1
        await new Promise<void>((resolve) => { release = resolve })
      },
      () => undefined,
    )

    const first = run()
    await settled()
    void run() // arrives while the first is still going
    release()
    await first
    await settled()

    expect(runs).toBe(2)
  })

  it('collapses several mid-run calls into one re-run', async () => {
    let runs = 0
    let release: () => void = () => {}

    const run = singleFlight(
      async () => {
        runs += 1
        await new Promise<void>((resolve) => { release = resolve })
      },
      () => undefined,
    )

    const first = run()
    await settled()
    void run()
    void run()
    void run()
    release()
    await first
    await settled()

    // Three callers, one re-run. They all wanted the same thing.
    expect(runs).toBe(2)
  })

  it('does not re-run when nothing arrived during the run', async () => {
    let runs = 0
    const run = singleFlight(async () => { runs += 1 }, () => undefined)
    await run()
    await settled()
    await settled()
    expect(runs).toBe(1)
  })

  it('hands a busy caller the placeholder rather than making it wait', async () => {
    let release: () => void = () => {}
    const run = singleFlight(
      async () => {
        await new Promise<void>((resolve) => { release = resolve })
        return 'real'
      },
      () => 'busy',
    )

    const first = run()
    await settled()
    expect(await run()).toBe('busy')
    release()
    expect(await first).toBe('real')
  })

  /* A job that throws must not wedge the gate shut. */
  it('recovers after the job throws', async () => {
    let runs = 0
    const run = singleFlight(
      async () => {
        runs += 1
        throw new Error('boom')
      },
      () => undefined,
    )

    await expect(run()).rejects.toThrow('boom')
    await expect(run()).rejects.toThrow('boom')
    expect(runs).toBe(2)
  })
})
