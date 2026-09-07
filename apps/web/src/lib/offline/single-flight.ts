/**
 * Runs a job one at a time, and re-runs it once if it was asked for again
 * while it was running.
 *
 * The naive version of this is a boolean that makes a concurrent call return
 * immediately, and it is wrong in a way that is very hard to see. A flush reads
 * the mutation queue *once*, at the start; anything enqueued after that read is
 * invisible to it. So a second call that is simply dropped does not mean "a
 * flush is already handling this" — it means "the work you just queued will
 * wait for some later trigger", which for the sync engine is up to fifteen
 * minutes.
 *
 * That produced a real bug: recording one flashcard review is two queued writes
 * in immediate succession — the history row and the SM-2 state — and only the
 * first reached the server. The student saw it save, because locally it had.
 * Their other device disagreed.
 *
 * So a call arriving mid-run sets a flag, and the run that is finishing starts
 * one more. That is enough: whatever the second caller enqueued is in the queue
 * by the time the re-run reads it.
 */
export function singleFlight<T>(job: () => Promise<T>, whenBusy: () => T) {
  let running = false
  let requested = false

  const invoke = async (): Promise<T> => {
    if (running) {
      requested = true
      return whenBusy()
    }

    running = true
    try {
      return await job()
    } finally {
      running = false
      if (requested) {
        requested = false
        /* Deliberately not awaited. The caller of the *first* run should not
         * wait on work queued by somebody else. */
        void invoke()
      }
    }
  }

  return invoke
}
