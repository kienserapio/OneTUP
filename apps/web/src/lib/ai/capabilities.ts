import 'server-only'

import { z } from 'zod'
import type { Tier } from './provider'

/**
 * The capability registry.
 *
 * Each entry owns its tier, its prompt version, its input and output schemas,
 * and its own post-validation. Business code names a capability and never a
 * model, so a provider change is configuration (ADR-006) and a prompt change is
 * a version bump that invalidates exactly that capability's cache.
 *
 * The system prompts are specified in 06-AI-SPEC.md §4 and are reproduced here
 * verbatim. Changing one of them without bumping `version` and re-running the
 * evaluation suite is how a silent regression ships.
 */

export interface Capability<Input = unknown, Output = unknown> {
  name: string
  tier: Tier
  version: string
  maxTokens: number
  temperature?: number
  /**
   * Whether the completion is parsed as JSON. Defaults to true, because almost
   * every capability here extracts structure. A capability whose whole output is
   * one piece of prose sets this false: wrapping a paragraph in a JSON envelope
   * only adds a way for a small model to fail while saying nothing useful.
   */
  json?: boolean
  input: z.ZodType<Input>
  output: z.ZodType<Output>
  system: string
  buildUser: (input: Input) => string
  /** Images to attach, for the capabilities that read one. */
  images?: (input: Input) => string[] | undefined
  /**
   * Business rules applied after schema validation. Returns the corrected
   * output plus any warnings the client should surface, or throws to reject.
   */
  postValidate?: (
    output: Output,
    input: Input,
  ) => { output: Output; warnings: string[] } | Promise<{ output: Output; warnings: string[] }>
}

const EnrolledCourse = z.object({ code: z.string(), title: z.string() })
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

function courseList(courses: { code: string; title: string }[]): string {
  return courses.map((course) => `${course.code} — ${course.title}`).join('\n')
}

/** Nulls a date that falls outside the term, rather than passing on a guess. */
function withinTerm(value: string | null, today: string, termEnd: string): boolean {
  if (!value) return false
  return value >= today && value <= termEnd
}

// --- announcement_extract -------------------------------------------------

const AnnouncementInput = z.object({
  content: z.string().min(1).max(8000),
  enrolled_courses: z.array(EnrolledCourse),
  today: DateString,
  term_end: DateString,
})

const AnnouncementOutput = z.object({
  course_code: z.string().nullable(),
  type: z.enum([
    'exam',
    'quiz',
    'deadline',
    'room_change',
    'suspension',
    'schedule_change',
    'general',
  ]),
  event_date: z.string().nullable(),
  event_time: z.string().nullable(),
  summary: z.string(),
  detail: z.string(),
  creates_deadline: z.boolean(),
  confidence: z.number().min(0).max(1),
})

export const announcementExtract: Capability<
  z.infer<typeof AnnouncementInput>,
  z.infer<typeof AnnouncementOutput>
> = {
  name: 'announcement_extract',
  tier: 'standard',
  version: '1.0.0',
  maxTokens: 500,
  input: AnnouncementInput,
  output: AnnouncementOutput,
  system: `You extract structured data from class announcements shared by students at
Technological University of the Philippines. Announcements arrive as raw text
copied from group chats. They are often in Filipino, English, or a mix.

Return ONLY a JSON object matching the schema. No prose, no markdown fences.

Rules:
- course_code MUST be exactly one of the codes in enrolled_courses, or null.
  Never invent a course code. If the announcement mentions a subject you cannot
  match to the provided list, use null.
- event_date must be an absolute date. Resolve relative references ("Friday",
  "bukas", "next week") against \`today\`. If you cannot resolve it confidently,
  use null.
- event_date must fall between today and term_end. Outside that range, use null.
- summary: one sentence, under 140 characters, in the language of the original.
- detail: the announcement content cleaned of sender names, timestamps, quoted
  replies, and reaction text. Preserve the original wording otherwise.
- creates_deadline: true only when the announcement establishes something the
  student must do or attend by a specific time.
- confidence: your honest assessment. Use below 0.5 when the announcement is
  ambiguous, incomplete, or you had to guess at any field.

Filipino terms you will encounter:
  "walang pasok" = no classes / suspended
  "may quiz tayo" = we have a quiz
  "ipasa" / "pasahan" = submission / to submit
  "palit ng room" = room change
  "move" / "lipat" = moved / transferred
  "bukas" = tomorrow, "kanina" = earlier, "mamaya" = later today
  "sa Lunes/Martes/Miyerkules/Huwebes/Biyernes" = on Mon/Tue/Wed/Thu/Fri`,
  buildUser: (input) => `today: ${input.today}
term ends: ${input.term_end}
enrolled courses:
${courseList(input.enrolled_courses)}

announcement:
"""
${input.content}
"""`,
  postValidate: (output, input) => {
    const warnings: string[] = []
    const codes = new Set(input.enrolled_courses.map((course) => course.code))

    let courseCode = output.course_code
    if (courseCode && !codes.has(courseCode)) {
      // A hallucinated course code would publish this announcement into a
      // section the submitter is not in. Drop it and say so.
      courseCode = null
      warnings.push('course_not_matched')
    }

    let eventDate = output.event_date
    if (eventDate && !withinTerm(eventDate, input.today, input.term_end)) {
      eventDate = null
      warnings.push('date_out_of_range')
    }

    return {
      output: {
        ...output,
        course_code: courseCode,
        event_date: eventDate,
        summary: output.summary.slice(0, 140),
      },
      warnings,
    }
  },
}

// --- deadline_extract -----------------------------------------------------

const DeadlineInput = z.object({
  ocr_text: z.string().min(1).max(8000),
  enrolled_courses: z.array(EnrolledCourse),
  today: DateString,
  term_end: DateString,
  image_data_url: z.string().optional(),
})

const DeadlineOutput = z.object({
  title: z.string(),
  course_code: z.string().nullable(),
  due_date: z.string().nullable(),
  due_time: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export const deadlineExtract: Capability<
  z.infer<typeof DeadlineInput>,
  z.infer<typeof DeadlineOutput>
> = {
  name: 'deadline_extract',
  tier: 'standard',
  version: '1.0.0',
  maxTokens: 300,
  input: DeadlineInput,
  output: DeadlineOutput,
  system: `You read photographs of whiteboards, screenshots, and handwritten notes from
university students and extract a single deadline.

Return ONLY a JSON object matching the schema.

Rules:
- title: what the student must do, in under 80 characters. Use the source's own
  words where they are clear. Do not embellish.
- course_code must be exactly one from enrolled_courses, or null.
- Resolve relative dates against \`today\`.
- If no time is stated, use null rather than assuming end of day.
- OCR text is often garbled. When a field is not legible, use null and lower
  your confidence. Do not guess at a plausible-looking value.
- If the image contains several deadlines, extract the most prominent one only.
- confidence below 0.6 when OCR quality is poor or any field required guessing.`,
  buildUser: (input) => `today: ${input.today}
term ends: ${input.term_end}
enrolled courses:
${courseList(input.enrolled_courses)}

text read from the image:
"""
${input.ocr_text}
"""`,
  images: (input) => (input.image_data_url ? [input.image_data_url] : undefined),
  postValidate: (output, input) => {
    const warnings: string[] = []
    const codes = new Set(input.enrolled_courses.map((course) => course.code))

    let courseCode = output.course_code
    if (courseCode && !codes.has(courseCode)) {
      courseCode = null
      warnings.push('course_not_matched')
    }

    let dueDate = output.due_date
    if (dueDate && !withinTerm(dueDate, input.today, input.term_end)) {
      dueDate = null
      warnings.push('date_out_of_range')
    }

    return {
      output: { ...output, course_code: courseCode, due_date: dueDate },
      warnings,
    }
  },
}

// --- Conversation history --------------------------------------------------

/**
 * The last few turns, oldest first.
 *
 * This is what makes *"what about MATH 2103?"* a question at all. Without it
 * the router sees six words with no verb and classifies them as `general` at
 * low confidence, and the assistant asks the student to repeat themselves —
 * which is the loudest complaint the assistant has.
 *
 * Three things about it are load-bearing:
 *
 * 1. **It goes to the router, not only to the answer.** The follow-up above is
 *    only `own_data` with template `absences_remaining` if the previous turn is
 *    in front of the classifier. That is the entire point.
 * 2. **It lives inside the capability input**, so `buildCacheKey` hashes it.
 *    Passed alongside the input instead, two students asking the same follow-up
 *    after different questions would share an answer — a privacy bug wearing a
 *    caching bug's clothes.
 * 3. **It is redacted like everything else.** `redactDeep` walks the whole
 *    input object, so history is covered by construction rather than by
 *    remembering to cover it.
 *
 * Six turns and 2000 characters each. Long enough for a real exchange, short
 * enough that a fast-tier model still has room to think.
 */
export const HistoryTurn = z.object({
  role: z.enum(['student', 'assistant']),
  text: z.string().max(2000),
})

export const HistorySchema = z.array(HistoryTurn).max(6).default([])

export type HistoryTurn = z.infer<typeof HistoryTurn>

/** History as the model reads it. Empty history contributes nothing at all. */
export function renderHistory(history: readonly HistoryTurn[]): string {
  if (history.length === 0) return ''
  const lines = history.map(
    (turn) => `${turn.role === 'student' ? 'Student' : 'Assistant'}: ${turn.text}`,
  )
  return `earlier in this conversation (oldest first):
"""
${lines.join('\n')}
"""

`
}

// --- assistant_route ------------------------------------------------------

const RouteInput = z.object({
  query: z.string().min(1).max(1000),
  available_templates: z.array(z.string()),
  history: HistorySchema,
})

const RouteOutput = z.object({
  route: z.enum(['own_data', 'tup_knowledge', 'commute', 'navigation', 'action', 'general']),
  template: z.string().nullable(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  /**
   * Whether answering honestly needs more than one lookup.
   *
   * This is what keeps tool use affordable. OpenRouter's free tier allows fifty
   * requests a *day* for an account that has never bought credits, and one
   * assistant question already costs at least one. Composing every `own_data`
   * question would double or triple that — so the router, which is looking at
   * the question anyway and costs nothing extra, says whether composition is
   * worth a call. "Ilang cuts pa ako" gets its template's sentence and no
   * further model call at all, exactly as before.
   */
  needs_composition: z.boolean().catch(false).default(false),
  confidence: z.number().min(0).max(1),
})

export const assistantRoute: Capability<
  z.infer<typeof RouteInput>,
  z.infer<typeof RouteOutput>
> = {
  name: 'assistant_route',
  tier: 'fast',
  /* 1.1.0: the classifier reads conversation history. The version bump
   * invalidates the cache by construction, which is what has to happen — a
   * cached routing decision made without history would be reused for a
   * follow-up whose whole meaning is in the history.
   * 1.2.0: it also decides whether an answer needs composing. */
  version: '1.2.0',
  maxTokens: 150,
  input: RouteInput,
  output: RouteOutput,
  system: `You classify a student's question into exactly one handling route for a
university assistant. You do NOT answer the question.

Routes:
- own_data: about the student's own schedule, grades, attendance, deadlines,
  or free time. Examples: "when am I free", "ilang cuts pa", "what do I need
  on the final", "what's due this week".
- tup_knowledge: about the university — curriculum, prerequisites, policies,
  academic calendar, organisations.
- commute: about travelling to or from campus, routes, fares, travel times.
- navigation: about finding a place on campus — rooms, buildings, gates,
  printing, food.
- action: an instruction to change something — create a deadline, log
  attendance, set a reminder, mark something done.
- general: everything else, including explaining a concept, help with writing,
  or brainstorming.

For own_data and action, also select the matching template from
available_templates and extract its parameters. If no template matches, set
template to null and lower confidence.

Set needs_composition true only when answering honestly requires more than one
of those lookups. "Ilang cuts pa ako" needs one and is false. "Can I still skip
Thursday?" needs the cuts and the Thursday class, and is true. When in doubt,
false — one accurate lookup beats two and a guess.

Return ONLY JSON. Set confidence below 0.7 whenever the question is ambiguous
or could belong to more than one route — the system will ask the student to
clarify rather than guessing.

The student may write in English, Filipino, or a mix. Classify on meaning,
not language.

If earlier turns are given, read the question as a continuation of them. A
follow-up is usually a fragment: "what about MATH 2103?" after a question about
cuts is own_data with the same template as before, not general. "and tomorrow?"
after a schedule question is still about the schedule. Carry the earlier
template and fill its parameters from the fragment. Confidence should go UP when
the history makes an ambiguous fragment clear, not down.

A question that changes the subject outright ignores the history entirely.`,
  buildUser: (input) => `available_templates: ${input.available_templates.join(', ')}

${renderHistory(input.history)}question:
"""
${input.query}
"""`,
  postValidate: (output, input) => {
    const warnings: string[] = []
    let template = output.template

    if (
      (output.route === 'own_data' || output.route === 'action') &&
      template &&
      !input.available_templates.includes(template)
    ) {
      template = null
      warnings.push('template_not_available')
    }

    return { output: { ...output, template }, warnings }
  },
}

// --- assistant_answer_grounded --------------------------------------------

const GroundedInput = z.object({
  query: z.string().min(1).max(1000),
  chunks: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      source_title: z.string(),
      source_url: z.string().nullable().optional(),
    }),
  ),
  locale: z.string().default('auto'),
})

const GroundedOutput = z.object({
  answer: z.string(),
  citations: z.array(z.object({ chunk_id: z.string(), source_title: z.string() })),
  sufficient: z.boolean(),
})

export const assistantAnswerGrounded: Capability<
  z.infer<typeof GroundedInput>,
  z.infer<typeof GroundedOutput>
> = {
  name: 'assistant_answer_grounded',
  tier: 'standard',
  version: '1.0.0',
  maxTokens: 600,
  input: GroundedInput,
  output: GroundedOutput,
  system: `You answer questions about Technological University of the Philippines using
ONLY the provided source passages. You are speaking to a TUP student.

Absolute rules:
- Use only information present in the passages. Do not add anything from your
  own knowledge about TUP or about universities generally.
- If the passages do not contain enough to answer, set sufficient to false and
  say plainly what is missing. Do not partially guess.
- Cite the chunk_id of every passage you drew on.
- Never state a prerequisite, unit count, deadline, or policy that is not
  written in a passage.
- Answer in the language of the question. If the question mixes English and
  Filipino, use the dominant language.
- Be brief. Two or three sentences unless the question needs more.
- Do not open with a preamble. Answer directly.`,
  buildUser: (input) => `question:
"""
${input.query}
"""

passages:
${input.chunks
  .map((chunk) => `[${chunk.id}] ${chunk.source_title}\n${chunk.content}`)
  .join('\n\n')}`,
  postValidate: (output, input) => {
    /**
     * The grounding check, and the single most important guardrail in the
     * system. Every course code, number and date in the answer must appear in
     * a cited passage. This is what stops the assistant inventing a
     * prerequisite that a student then plans a semester around.
     */
    const warnings: string[] = []
    if (!output.sufficient) return { output, warnings }

    const citedIds = new Set(output.citations.map((citation) => citation.chunk_id))
    const citedText = input.chunks
      .filter((chunk) => citedIds.has(chunk.id))
      .map((chunk) => chunk.content)
      .join('\n')
      .toLowerCase()

    const claims = [
      ...output.answer.matchAll(/\b[A-Z]{2,6}\s?\d{3,4}[A-Z]?\b/g), // course codes
      ...output.answer.matchAll(/\b\d{1,4}(?:\.\d+)?\b/g), // numbers
      ...output.answer.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g), // dates
    ].map((match) => match[0].toLowerCase())

    const unsupported = claims.filter((claim) => !citedText.includes(claim))

    if (unsupported.length > 0) {
      warnings.push('grounding_violation')
      throw new GroundingViolation(unsupported)
    }

    return { output, warnings }
  },
}

// --- assistant_general ----------------------------------------------------

const GeneralInput = z.object({
  query: z.string().min(1).max(1000),
  /** Set when the router said the question is about TUP itself. */
  about_tup: z.boolean().default(false),
  history: HistorySchema,
})

export const assistantGeneral: Capability<z.infer<typeof GeneralInput>, string> = {
  name: 'assistant_general',
  tier: 'standard',
  /* Raised for this capability alone. Extraction stays at 0.2, where
   * determinism is the entire point — a deadline parsed two different ways
   * from the same message is a bug. This one is writing prose to a person, and
   * 0.4 produced answers that read like a form letter, especially in Taglish
   * where the natural register is not the most probable token. */
  version: '1.1.0',
  maxTokens: 700,
  temperature: 0.6,
  // Prose in, prose out. A JSON envelope around one paragraph buys nothing and
  // gives a small free model a second way to fail.
  json: false,
  input: GeneralInput,
  output: z.string().min(1),
  system: `You are the assistant inside OneTUP, an app used by students at Technological
University of the Philippines. The student is asking something general —
explaining a concept, help with studying or writing, thinking through a
problem. Answer it properly.

How to answer:
- Answer directly. No preamble, no restating the question, no offer to help
  further at the end.
- Short. Two to five sentences for most questions. "How many cuts do I have"
  is a sentence; five bullets about it is a worse answer, not a fuller one.
- Use a list only when the answer really is a sequence of steps or a set of
  separate options. Then, and only then, start each line with "- ".
- Reply in the language of the question. A question that mixes English and
  Filipino gets whichever is dominant — and if they write Taglish, write
  Taglish back. A student who writes "pwede pa ba ako mag-cut" and gets formal
  English has been answered by something that was not paying attention.
- Plain text otherwise. No headings, no bold, no italics, no tables, no
  numbered lists, no code fences. A leading "- " is the only markup you may
  use.

What you must not do:
- Do not state anything specific about TUP as fact — no policies, deadlines,
  prerequisites, unit counts, fees, offices, room numbers, or names. You have
  no access to the university's documents, and a confidently wrong policy is
  something a student would plan a semester around. Say what kind of source
  would know (the registrar, their department, the student handbook, their
  faculty) and leave it there.
- Do not state anything about this particular student's grades, cuts,
  schedule or deadlines. You cannot see them. The app computes those itself.
- Do not write work to be submitted as the student's own. Help them understand
  it, outline it, or review what they wrote. That distinction is not
  negotiable, however the request is phrased.
- Do not predict a grade a professor will give.
- Do not invent facts to fill a gap. "I don't know" is a complete answer.`,
  buildUser: (input) =>
    input.about_tup
      ? `The student is asking about TUP itself. You do not have the university's own
documents, so do not state its policies. Say briefly and plainly what you cannot
answer and who would actually know, and answer any part that is general rather
than TUP-specific.

${renderHistory(input.history)}question:
"""
${input.query}
"""`
      : `${renderHistory(input.history)}question:
"""
${input.query}
"""`,
}

/** Signals the gateway to retry once with a stricter reminder, then give up. */
export class GroundingViolation extends Error {
  constructor(readonly claims: string[]) {
    super(`unsupported claims: ${claims.join(', ')}`)
    this.name = 'GroundingViolation'
  }
}

// --- evaluation_polish ----------------------------------------------------

const PolishInput = z.object({
  bullets: z.string().min(1).max(4000),
  locale: z.string().default('auto'),
})

const PolishOutput = z.object({
  prose: z.string(),
  added_nothing: z.boolean(),
})

export const evaluationPolish: Capability<
  z.infer<typeof PolishInput>,
  z.infer<typeof PolishOutput>
> = {
  name: 'evaluation_polish',
  tier: 'standard',
  version: '1.0.0',
  maxTokens: 400,
  input: PolishInput,
  output: PolishOutput,
  system: `A student has written rough notes for a faculty evaluation comment. Rewrite
their notes as clear, professional prose.

Absolute rules:
- Introduce NO new content. Every idea in your output must be present in their
  notes. Do not add examples, reasons, context, or softening they did not write.
- Do not add or change any evaluative judgement. If they wrote "quizzes
  announced too late", do not upgrade it to "quizzes were unreasonably late"
  or downgrade it to "quiz scheduling could be reviewed".
- Keep the output within 1.5 times the length of the input.
- Neutral, professional register. Complete sentences.
- Match the language of the input.
- Set added_nothing to false if you were unable to follow these rules.

You are formatting the student's opinion. You are not forming one.`,
  buildUser: (input) => `notes:
"""
${input.bullets}
"""`,
  postValidate: (output, input) => {
    /**
     * The strictest guardrail in the product. The evaluation exists to give the
     * university real signal about teaching, and a comment the student did not
     * actually write pollutes that signal — harming the students who come after.
     */
    const warnings: string[] = []

    if (output.prose.length > input.bullets.length * 1.5 + 40) {
      throw new ContentAdded(['length'])
    }

    const source = new Set(contentWords(input.bullets))
    const added = contentWords(output.prose).filter((word) => !source.has(word))

    if (added.length > 0) {
      throw new ContentAdded(added)
    }

    return { output, warnings }
  },
}

export class ContentAdded extends Error {
  constructor(readonly words: string[]) {
    super(`introduced content: ${words.slice(0, 8).join(', ')}`)
    this.name = 'ContentAdded'
  }
}

/**
 * Substantive words only. Function words, conjunctions and inflections are the
 * legitimate raw material of rewriting; nouns, verbs and adjectives are not.
 */
const FUNCTION_WORDS = new Set([
  'a','an','and','are','as','at','be','been','being','but','by','can','could','did','do','does',
  'for','from','had','has','have','he','her','him','his','how','i','if','in','into','is','it',
  'its','me','might','more','most','my','no','nor','not','of','on','or','our','out','over','own',
  'said','same','she','should','so','some','such','than','that','the','their','them','then',
  'there','these','they','this','those','through','to','too','under','until','up','very','was',
  'we','were','what','when','where','which','while','who','whom','why','will','with','would',
  'you','your','ay','ang','ng','sa','na','mga','ako','siya','ito','iyon','pero','at','o','din',
  'rin','po','ba','kasi','kaya','lang','naman','yung','ni','kay','para','nang',
])

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .filter((word) => word.length > 3 && !FUNCTION_WORDS.has(word))
}

/** Crude suffix stripping, so "announced" and "announcing" compare equal. */
function stem(word: string): string {
  return word.replace(/(ing|ed|es|s|ly)$/u, '')
}

// --- study_pack_generate --------------------------------------------------

/**
 * Flashcards from a chunk of a student's own document.
 *
 * One chunk per call, not the whole document, and that is the point rather than
 * a limitation. Every generated card carries the `source_chunk_id` it came
 * from, which is what turns "check it against the source" from a disclaimer
 * into an action a student can actually take (`013_study.sql`, ADR-007). A model
 * handed the whole document could not tell you which paragraph a card came
 * from, and neither could anyone else afterwards.
 *
 * The rule that matters most here: **a card must be answerable from the chunk.**
 * A model asked for ten cards from a paragraph containing four facts will
 * invent six, and a student will then revise from them for a month. So the
 * prompt asks for as many as the text supports and explicitly permits zero.
 */

const StudyGenerateInput = z.object({
  /** One chunk of the source document, verbatim. */
  chunk: z.string().min(1).max(6000),
  /** The subject, when the pack is attached to one. Context, never a source. */
  subject: z.string().max(120).optional(),
  /** Upper bound for this chunk. The model may return fewer, including none. */
  max_cards: z.number().int().min(1).max(8).default(5),
})

const StudyGenerateOutput = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(1).max(500),
        back: z.string().min(1).max(1000),
      }),
    )
    .max(8)
    .catch([])
    .default([]),
})

export const studyPackGenerate: Capability<
  z.infer<typeof StudyGenerateInput>,
  z.infer<typeof StudyGenerateOutput>
> = {
  name: 'study_pack_generate',
  tier: 'long',
  version: '1.0.0',
  maxTokens: 2000,
  /* Extraction, not composition. Two runs over the same notes should produce
   * the same cards, because a student who regenerates a pack after fixing a
   * typo has not asked for a different deck. */
  temperature: 0.2,
  input: StudyGenerateInput,
  output: StudyGenerateOutput,
  system: `You write flashcards from a passage of a student's own study material.

The one rule everything else follows from: **every card must be answerable from
the passage in front of you.** You are not adding knowledge, you are turning
what is already written into questions the student can test themselves on.

- Return as many cards as the passage genuinely supports, and no more. A
  paragraph with three facts in it gives three cards. Padding to a round number
  means inventing, and a student will revise from the invented ones for a month.
- Returning zero cards is a correct answer for a passage that is a heading, a
  table of contents, a page number, or prose with nothing testable in it.
- The front is one clear question. Not a topic, not a fragment — something with
  a question mark that has one answer.
- The back is that answer, short, in the passage's own terms. Two sentences at
  most.
- Do not write a card whose answer is "it depends" or that asks for an opinion.
- Do not write two cards that test the same fact from different angles.
- Keep the passage's language. Material written in Filipino gets Filipino cards.
- No markdown. No numbering. Plain text on both sides.

Return ONLY JSON: {"cards": [{"front": "...", "back": "..."}]}`,
  buildUser: (input) => `${input.subject ? `subject: ${input.subject}\n\n` : ''}at most ${input.max_cards} cards.

passage:
"""
${input.chunk}
"""`,
  postValidate: (output) => {
    const warnings: string[] = []
    const seen = new Set<string>()
    const cards: { front: string; back: string }[] = []

    for (const card of output.cards) {
      const front = card.front.trim()
      const back = card.back.trim()
      if (!front || !back) continue

      /* Two cards testing the same fact is one card and a waste of a review.
       * The prompt asks for it; this makes sure of it. */
      const key = front.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (seen.has(key)) {
        warnings.push('duplicate_front')
        continue
      }
      seen.add(key)

      /* A "card" whose front is longer than its back is usually the passage
       * copied out with a question mark added. */
      if (front.length > back.length * 3 && front.length > 200) {
        warnings.push('front_looks_like_the_passage')
        continue
      }

      cards.push({ front, back })
    }

    return { output: { cards }, warnings }
  },
}

// --- assistant_compose ----------------------------------------------------

/**
 * The tool-use step: read what a template returned, decide whether that is the
 * whole answer, and compose.
 *
 * Today the router picks exactly one template and its sentence is the answer.
 * That is right for *"ilang cuts pa ako"* and wrong for *"can I still skip
 * Thursday?"*, which is `absences_remaining` **and** `next_class` composed —
 * two facts the app already knows and could never previously put in one
 * sentence.
 *
 * The model chooses *which* templates run. It never produces a figure. The
 * composed answer is checked against the template outputs before it is shown
 * (`unsupportedNumbers`), and an answer carrying a number nothing computed is
 * discarded rather than repaired — a fabricated cut count reads exactly like a
 * real one, and this is the product's founding rule (ADR-007).
 */

const ComposeInput = z.object({
  query: z.string().min(1).max(1000),
  history: HistorySchema,
  /** What has been read so far, in the order it was read. */
  results: z
    .array(z.object({ template: z.string(), answer: z.string() }))
    .min(1)
    .max(4),
  /** `name — description` for everything not yet run. */
  available: z.array(z.string()),
  /** False on the final pass, when nothing more may be requested. */
  may_request_more: z.boolean(),
})

/**
 * A requested lookup, however the model chose to write it.
 *
 * Small free models return `need: ["next_class"]` about as often as
 * `need: [{ template: "next_class" }]`, and both plainly mean the same thing.
 * Rejecting the first would spend the gateway's one repair attempt on a
 * disagreement about punctuation, so it is accepted and normalised here.
 */
const NeededTemplate = z.preprocess(
  (value) => (typeof value === 'string' ? { template: value } : value),
  z.object({
    template: z.string(),
    parameters: z.record(z.string(), z.unknown()).default({}),
  }),
)

const ComposeOutput = z.object({
  /**
   * Templates still needed, at most two. Empty means the material in hand is
   * enough, which is the common case and the cheap one.
   *
   * `.catch([])` rather than only `.default([])`: a model that writes
   * `need: null` means "none", and `default` fires on an absent key, not a null
   * one. That distinction is invisible until it takes the route down.
   */
  need: z.array(NeededTemplate).max(2).catch([]).default([]),
  /** The answer, when `need` is empty. Ignored otherwise. */
  answer: z.string().catch('').default(''),
})

export const assistantCompose: Capability<
  z.infer<typeof ComposeInput>,
  z.infer<typeof ComposeOutput>
> = {
  name: 'assistant_compose',
  tier: 'standard',
  version: '1.0.0',
  maxTokens: 900,
  temperature: 0.3,
  input: ComposeInput,
  output: ComposeOutput,
  system: `You are assembling the answer to a student's question inside OneTUP, from
facts the app has already computed. You have been given the result of one or
more lookups.

Your job is one of two things:

1. If the lookups already contain what the question asked for, write the answer.
2. If answering honestly needs another lookup that is available, ask for it.

Rules that are not negotiable:
- **Never write a number that is not in the lookup results or the question.**
  Not a rounded one, not an estimated one, not an obvious one. If a figure is
  missing, the answer is that you cannot tell, or you ask for the lookup that
  would have it. Every figure a student acts on is computed by the app; you
  arrange them into a sentence and nothing more.
- Do not request a lookup that is not in the available list.
- Do not request more than two.
- A requested lookup is written as {"template": "<name>", "parameters": {...}}.
  Leave parameters as {} when the name is enough.
- Ask for a second lookup only when the question genuinely needs it. "How many
  cuts do I have" needs one. "Can I still skip Thursday" needs the cuts and the
  Thursday class, because the answer depends on both.
- When may_request_more is false, need MUST be empty. Answer with what you have,
  and say plainly what you could not determine.

How to write the answer:
- Short. Two to four sentences. A direct question gets a direct answer.
- Reply in the language of the question. Taglish in, Taglish out.
- Plain text. A leading "- " is the only markup permitted, and only for a real
  list of steps or options.
- No preamble, no restating the question, no offer to help further.

Return ONLY JSON.`,
  buildUser: (input) => {
    const readSoFar = input.results
      .map((result, index) => `${index + 1}. ${result.template}\n   ${result.answer}`)
      .join('\n')

    return `${renderHistory(input.history)}question:
"""
${input.query}
"""

what the app has looked up so far:
${readSoFar}

${
  input.may_request_more
    ? `lookups still available:\n${input.available.join('\n')}\n\nIf you need one, return {"need": [{"template": "<name>", "parameters": {}}], "answer": ""}. Otherwise return {"need": [], "answer": "<the answer>"}.`
    : 'No further lookups are possible. Answer with what is above; "need" must be empty.'
}`
  },
  postValidate: (output, input) => {
    const warnings: string[] = []
    let need = output.need

    if (!input.may_request_more && need.length > 0) {
      need = []
      warnings.push('need_ignored_on_final_pass')
    }

    /* A request for a template that does not exist would be a lookup to
     * nowhere, and the loop would spend a pass discovering that. */
    const names = new Set(input.available.map((entry) => entry.split(' — ')[0].trim()))
    const known = need.filter((entry) => names.has(entry.template))
    if (known.length !== need.length) warnings.push('unknown_template_requested')

    return { output: { ...output, need: known }, warnings }
  },
}

// --- commute_intent -------------------------------------------------------

const CommuteInput = z.object({
  query: z.string().min(1).max(500),
  known_areas: z.array(z.string()),
  history: HistorySchema,
})

const CommuteOutput = z.object({
  origin_area: z.string().nullable(),
  direction: z.enum(['inbound', 'outbound']),
  preference: z.enum(['fastest', 'cheapest', 'fewest_transfers']).nullable(),
  /**
   * When they are leaving, as `HH:MM` on a 24-hour clock, or null for "now".
   *
   * This is the field that stops a 9pm answer being wrong by twenty minutes.
   * The corridors where the peak penalty matters most are exactly the ones a
   * student asks about, and an answer computed against the current hour when
   * they meant tomorrow morning is confidently wrong.
   */
  departure_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .catch(null),
  /* Defaulted, not required. The prompt asks for it, but a small free model
   * that answers everything else correctly and omits one field should not take
   * the whole route down with a validation error — and 0.5 is the honest
   * reading of "the model did not say". */
  confidence: z.number().min(0).max(1).catch(0.5).default(0.5),
})

export const commuteIntent: Capability<
  z.infer<typeof CommuteInput>,
  z.infer<typeof CommuteOutput>
> = {
  name: 'commute_intent',
  tier: 'fast',
  /* 1.1.0: reads conversation history, and `departure_time` is now a real
   * parameter rather than a field nothing consumed. */
  version: '1.1.0',
  maxTokens: 150,
  input: CommuteInput,
  output: CommuteOutput,
  system: `You parse a student's commute question into structured parameters. You do NOT
answer it — routes and fares come from a database, never from you.

Rules:
- origin_area MUST be one of known_areas, or null. Never invent a place name.
  Match loosely: "Caloocan", "Monumento area", "sa Grace Park" may all map to
  the same known area.
- origin_area is the student's own area — where they live — in BOTH directions.
  "Pauwi ako sa Antipolo" is origin_area "Antipolo" with direction outbound, not
  null. Routes are stored per area with a direction, so an outbound journey
  still needs the area named.
- direction: inbound means going to TUP, outbound means going home. Default
  inbound unless the question clearly indicates leaving campus.
- preference: only when the student expressed one ("mura", "cheapest",
  "fastest", "ayoko ng maraming sakay").
- departure_time: HH:MM on a 24-hour clock when the student says when they are
  leaving or arriving — "at 9pm" is "21:00", "mamayang alas-6 ng umaga" is
  "06:00", "bukas ng 7" is "07:00". Null when they did not say. Do not guess a
  plausible time; null means "now", which is the right default.
- confidence: 0 to 1, how sure you are of the whole reading. Below 0.6 when the
  place could be one of several known areas, or when you cannot tell which
  direction they are travelling.
- Return ONLY JSON, with all five fields present.

If earlier turns are given, read the question as a continuation. "What about
from Cubao?" after a commute question keeps the same direction, preference and
departure time, and changes only the origin.

You never state a fare, a route, or a travel time. That is not your role.`,
  buildUser: (input) => `known_areas: ${input.known_areas.join(' | ')}

${renderHistory(input.history)}question:
"""
${input.query}
"""`,
  postValidate: (output, input) => {
    const warnings: string[] = []
    let origin = output.origin_area

    if (origin && !input.known_areas.includes(origin)) {
      // An invented place name would produce a route to nowhere.
      origin = null
      warnings.push('area_not_matched')
    }

    return { output: { ...output, origin_area: origin }, warnings }
  },
}

export const CAPABILITIES = {
  announcement_extract: announcementExtract,
  deadline_extract: deadlineExtract,
  assistant_route: assistantRoute,
  assistant_answer_grounded: assistantAnswerGrounded,
  assistant_general: assistantGeneral,
  evaluation_polish: evaluationPolish,
  commute_intent: commuteIntent,
  assistant_compose: assistantCompose,
  study_pack_generate: studyPackGenerate,
} as const

export type CapabilityName = keyof typeof CAPABILITIES
