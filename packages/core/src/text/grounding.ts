/**
 * Checking that every figure in a composed answer came from somewhere.
 *
 * ADR-007 is the rule the whole product rests on: a model may phrase a number,
 * it may never produce one. That was easy to guarantee while the assistant ran
 * exactly one template and returned its sentence verbatim. The moment a model
 * is allowed to *compose* two template results into one answer, it can also
 * quietly add a third figure that nothing computed — and a fabricated cut count
 * reads exactly like a real one.
 *
 * So the composed answer is checked before it is shown. Every number in it must
 * appear in the material it was composed from: the template outputs, their
 * values, and the student's own question.
 */

/**
 * Numbers as they appear in prose: 9, 2.5, 1,200, 85%, ₱24.00, 3rd.
 *
 * The trailing `%` and the leading currency symbol are not captured — only the
 * digits matter, because the question is where the quantity came from, not how
 * it was punctuated.
 */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/g

/** A tolerance, not an equality test: 2.5 and 2.50 are the same claim. */
const EPSILON = 1e-9

function numbersIn(text: string): number[] {
  const found = text.match(NUMBER) ?? []
  return found
    .map((token) => Number(token.replace(/,/g, '')))
    .filter((value) => Number.isFinite(value))
}

/**
 * Every number in `answer` that does not appear in any of `sources`.
 *
 * An empty result means the answer is grounded. A non-empty one means the model
 * introduced a quantity of its own, and the answer must not be shown.
 *
 * Deliberately permissive in one direction: a number that appears anywhere in
 * the sources counts as supported, even if the composition used it in a
 * different sentence. Proving that a model rearranged figures *correctly* is a
 * much harder problem than proving it did not invent one, and inventing one is
 * the failure that matters.
 */
export function unsupportedNumbers(answer: string, sources: readonly string[]): number[] {
  const supported = new Set<number>()
  for (const source of sources) {
    for (const value of numbersIn(source)) supported.add(value)
  }

  const unsupported: number[] = []
  for (const value of numbersIn(answer)) {
    if (isSupported(value, supported)) continue
    if (unsupported.some((seen) => Math.abs(seen - value) < EPSILON)) continue
    unsupported.push(value)
  }
  return unsupported
}

/**
 * A number counts as supported when it equals one in the sources, or is that
 * number written to fewer decimals.
 *
 * "1.75" for a GWA of 1.75 is the same claim. "1.8" for 1.75 is not — it is a
 * rounding the student did not ask for, on a figure they may act on, and the
 * rule is that the app states the number it computed.
 */
function isSupported(value: number, supported: ReadonlySet<number>): boolean {
  for (const known of supported) {
    if (Math.abs(known - value) < EPSILON) return true
  }
  return false
}

/**
 * Numbers a composed answer may use without any source, because they are
 * language rather than data.
 *
 * Kept empty on purpose, and documented so the next person does not add one
 * casually. "One more absence" spelled as a word is not caught by `NUMBER` at
 * all, which is the right escape hatch: prose stays prose, and a digit is a
 * claim.
 */
export const FREE_NUMBERS: readonly number[] = []
