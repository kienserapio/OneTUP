/**
 * What the assistant remembers of a conversation.
 *
 * Pure, so it is testable — and it fails quietly: a history that drops the
 * wrong turns makes follow-ups stop working with no error anywhere. How an
 * answer is drawn lives in `markdown.ts`.
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
