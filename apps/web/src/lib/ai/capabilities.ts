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

// --- assistant_route ------------------------------------------------------

const RouteInput = z.object({
  query: z.string().min(1).max(1000),
  available_templates: z.array(z.string()),
})

const RouteOutput = z.object({
  route: z.enum(['own_data', 'tup_knowledge', 'commute', 'navigation', 'action', 'general']),
  template: z.string().nullable(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
})

export const assistantRoute: Capability<
  z.infer<typeof RouteInput>,
  z.infer<typeof RouteOutput>
> = {
  name: 'assistant_route',
  tier: 'fast',
  version: '1.0.0',
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

Return ONLY JSON. Set confidence below 0.7 whenever the question is ambiguous
or could belong to more than one route — the system will ask the student to
clarify rather than guessing.

The student may write in English, Filipino, or a mix. Classify on meaning,
not language.`,
  buildUser: (input) => `available_templates: ${input.available_templates.join(', ')}

question:
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

// --- commute_intent -------------------------------------------------------

const CommuteInput = z.object({
  query: z.string().min(1).max(500),
  known_areas: z.array(z.string()),
})

const CommuteOutput = z.object({
  origin_area: z.string().nullable(),
  direction: z.enum(['inbound', 'outbound']),
  preference: z.enum(['fastest', 'cheapest', 'fewest_transfers']).nullable(),
  departure_time: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export const commuteIntent: Capability<
  z.infer<typeof CommuteInput>,
  z.infer<typeof CommuteOutput>
> = {
  name: 'commute_intent',
  tier: 'fast',
  version: '1.0.0',
  maxTokens: 150,
  input: CommuteInput,
  output: CommuteOutput,
  system: `You parse a student's commute question into structured parameters. You do NOT
answer it — routes and fares come from a database, never from you.

Rules:
- origin_area MUST be one of known_areas, or null. Never invent a place name.
  Match loosely: "Caloocan", "Monumento area", "sa Grace Park" may all map to
  the same known area.
- direction: inbound means going to TUP, outbound means going home. Default
  inbound unless the question clearly indicates leaving campus.
- preference: only when the student expressed one ("mura", "cheapest",
  "fastest", "ayoko ng maraming sakay").
- Return ONLY JSON.

You never state a fare, a route, or a travel time. That is not your role.`,
  buildUser: (input) => `known_areas: ${input.known_areas.join(' | ')}

question:
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
  evaluation_polish: evaluationPolish,
  commute_intent: commuteIntent,
} as const

export type CapabilityName = keyof typeof CAPABILITIES
