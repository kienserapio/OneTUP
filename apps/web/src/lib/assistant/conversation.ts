/**
 * The two pure pieces of a conversation with the assistant: what it remembers,
 * and how an answer is shaped on the way to the screen.
 *
 * Neither touches React, the network or the database, so both are testable —
 * which matters because both fail quietly. A history that drops the wrong turns
 * makes follow-ups stop working with no error anywhere, and a renderer that
 * misses a bullet shows the student a literal hyphen and looks like the model
 * misbehaving.
 */

export interface ConversationTurn {
  role: 'student' | 'assistant'
  text: string
  /** Something the app said about itself, not part of the conversation. */
  error?: boolean
}

/**
 * The last three exchanges, oldest first, as the API wants them.
 *
 * Three pairs rather than the whole conversation: enough for a follow-up to
 * make sense, small enough that the router's fast-tier prompt still has room to
 * think. Six is also the cap the request schema enforces, so sending more would
 * simply be rejected.
 *
 * Error turns are dropped. "That did not work, try again" is the app talking
 * about itself, and feeding it back has the model apologising for an outage
 * that is already over.
 */
export const HISTORY_TURNS = 6

/** Matches `HistoryTurn.text` in `capabilities.ts`. Truncate rather than fail. */
const MAX_TURN_CHARS = 2000

export function historyFrom(
  turns: readonly ConversationTurn[],
): { role: ConversationTurn['role']; text: string }[] {
  return turns
    .filter((turn) => !turn.error && turn.text.trim().length > 0)
    .slice(-HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_TURN_CHARS) }))
}

export type AnswerBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }

/**
 * Splits an answer into paragraphs and lists.
 *
 * `assistant_general` used to be told both "use a short list when the answer is
 * a list of steps" and "no markdown", which the model cannot obey at once — so
 * it either wrote bullets that rendered as literal hyphens inside a paragraph,
 * or flattened a genuine sequence into a run-on sentence.
 *
 * A leading `- ` is now the only markup the prompt permits, and this is what
 * reads it. Everything else stays literal: a model that emits `**bold**` shows
 * the asterisks, which is the honest outcome and a visible reminder that the
 * rule exists.
 */
export function splitIntoBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  let paragraph: string[] = []
  let items: string[] = []

  const flushParagraph = () => {
    const joined = paragraph.join('\n').trim()
    if (joined) blocks.push({ kind: 'text', text: joined })
    paragraph = []
  }
  const flushList = () => {
    if (items.length > 0) blocks.push({ kind: 'list', items })
    items = []
  }

  for (const line of text.split('\n')) {
    /* A hyphen must start the line and be followed by a space and something —
     * so a dash used mid-sentence, and a bare "-" on its own, are both prose. */
    const bullet = /^\s*-\s+(.*)$/.exec(line)
    if (bullet && bullet[1].trim()) {
      flushParagraph()
      items.push(bullet[1].trim())
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return blocks
}
