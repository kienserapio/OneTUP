/**
 * Typed access to the generated database schema.
 *
 * `database.types.ts` is regenerated from the live schema by `pnpm db:types`.
 * Nothing in this file is hand-maintained beyond the aliases, so a column
 * rename shows up as a type error rather than as a runtime surprise.
 */

import type { Database } from './database.types'

export type { Database, Json } from './database.types'

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Views<T extends keyof PublicSchema['Views']> =
  PublicSchema['Views'][T]['Row']

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

// Aliases for the rows the app touches most, so feature code reads in domain
// terms rather than in table names.
export type Profile = Tables<'profiles'>
export type UserPreferences = Tables<'user_preferences'>
export type Enrollment = Tables<'enrollments'>
export type Course = Tables<'courses'>
export type Term = Tables<'terms'>
export type ScheduleBlockRow = Tables<'schedule_blocks'>
export type AttendanceRecord = Tables<'attendance_records'>
export type Grade = Tables<'grades'>
export type GradeComponentRow = Tables<'grade_components'>
export type Deadline = Tables<'deadlines'>
export type DeadlineSubtask = Tables<'deadline_subtasks'>
export type Announcement = Tables<'announcements'>
export type CommuteRoute = Tables<'commute_routes'>
export type CommuteLeg = Tables<'commute_legs'>
export type CommuteArea = Tables<'commute_areas'>
export type CampusPlace = Tables<'campus_places'>
export type DeparturePlanRow = Tables<'departure_plans'>
export type UserThreshold = Tables<'user_thresholds'>
export type Group = Tables<'groups'>
export type GroupMember = Tables<'group_members'>
export type GroupJoinRequest = Tables<'group_join_requests'>
export type ClassPost = Tables<'class_posts'>
export type ClassPostState = Tables<'class_post_states'>
export type StudyPack = Tables<'study_packs'>
export type Flashcard = Tables<'flashcards'>
export type FlashcardReview = Tables<'flashcard_reviews'>
export type SuspensionAdvisory = Tables<'suspension_advisories'>

export type TodayRow = Views<'v_today'>
export type GwaRow = Views<'v_gwa'>
export type AttendanceSummaryRow = Views<'v_attendance_summary'>
export type RouteSummaryRow = Views<'v_route_summary'>
export type UpcomingDeadlineRow = Views<'v_deadlines_upcoming'>
