export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_cache: {
        Row: {
          cache_key: string
          capability: string
          created_at: string
          expires_at: string
          hit_count: number
          model: string
          output: Json
          prompt_version: string
        }
        Insert: {
          cache_key: string
          capability: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          model: string
          output: Json
          prompt_version: string
        }
        Update: {
          cache_key?: string
          capability?: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          model?: string
          output?: Json
          prompt_version?: string
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          cache_hit: boolean
          capability: string
          created_at: string
          error_code: string | null
          id: string
          input_hash: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_version: string
          status: string
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          capability: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_hash: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_version: string
          status: string
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          capability?: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_hash?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      announcement_confirmations: {
        Row: {
          announcement_id: string
          created_at: string
          is_dispute: boolean
          user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          is_dispute?: boolean
          user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          is_dispute?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_confirmations_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_submissions: {
        Row: {
          announcement_id: string | null
          content_hash: string
          created_at: string
          extraction: Json | null
          id: string
          image_path: string | null
          raw_content: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          announcement_id?: string | null
          content_hash: string
          created_at?: string
          extraction?: Json | null
          id?: string
          image_path?: string | null
          raw_content?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string | null
          content_hash?: string
          created_at?: string
          extraction?: Json | null
          id?: string
          image_path?: string | null
          raw_content?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_submissions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          confirmations: number
          content_hash: string
          course_id: string | null
          created_at: string
          detail: string | null
          disputes: number
          event_date: string | null
          event_time: string | null
          extraction: Json | null
          id: string
          is_hidden: boolean
          is_university_wide: boolean
          section_id: string | null
          submitted_by: string | null
          summary: string
          term_id: string | null
          trust: Database["public"]["Enums"]["trust_level"]
          type: Database["public"]["Enums"]["announcement_type"]
          updated_at: string
        }
        Insert: {
          confirmations?: number
          content_hash: string
          course_id?: string | null
          created_at?: string
          detail?: string | null
          disputes?: number
          event_date?: string | null
          event_time?: string | null
          extraction?: Json | null
          id?: string
          is_hidden?: boolean
          is_university_wide?: boolean
          section_id?: string | null
          submitted_by?: string | null
          summary: string
          term_id?: string | null
          trust?: Database["public"]["Enums"]["trust_level"]
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Update: {
          confirmations?: number
          content_hash?: string
          course_id?: string | null
          created_at?: string
          detail?: string | null
          disputes?: number
          event_date?: string | null
          event_time?: string | null
          extraction?: Json | null
          id?: string
          is_hidden?: boolean
          is_university_wide?: boolean
          section_id?: string | null
          submitted_by?: string | null
          summary?: string
          term_id?: string | null
          trust?: Database["public"]["Enums"]["trust_level"]
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          block_id: string | null
          created_at: string
          delivery_mode: string | null
          enrollment_id: string
          id: string
          note: string | null
          recorded_via: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          delivery_mode?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          recorded_via?: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          block_id?: string | null
          created_at?: string
          delivery_mode?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          recorded_via?: string
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "v_today"
            referencedColumns: ["block_id"]
          },
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          reason: string | null
          reversible: boolean
          reverted_at: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          reason?: string | null
          reversible?: boolean
          reverted_at?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          reason?: string | null
          reversible?: boolean
          reverted_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      campus_places: {
        Row: {
          building_code: string | null
          campus: string
          category: Database["public"]["Enums"]["place_category"]
          contact_phone: string | null
          created_at: string
          description: string | null
          floor: string | null
          hours: Json | null
          id: string
          is_emergency: boolean
          last_verified_at: string | null
          lat: number
          lng: number
          name: string
          price_max: number | null
          price_min: number | null
          price_unit: string | null
          room_range_end: string | null
          room_range_start: string | null
          status: string
          submitted_by: string | null
          tour_scene_url: string | null
          updated_at: string
          verified_count: number
        }
        Insert: {
          building_code?: string | null
          campus?: string
          category: Database["public"]["Enums"]["place_category"]
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          floor?: string | null
          hours?: Json | null
          id?: string
          is_emergency?: boolean
          last_verified_at?: string | null
          lat: number
          lng: number
          name: string
          price_max?: number | null
          price_min?: number | null
          price_unit?: string | null
          room_range_end?: string | null
          room_range_start?: string | null
          status?: string
          submitted_by?: string | null
          tour_scene_url?: string | null
          updated_at?: string
          verified_count?: number
        }
        Update: {
          building_code?: string | null
          campus?: string
          category?: Database["public"]["Enums"]["place_category"]
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          floor?: string | null
          hours?: Json | null
          id?: string
          is_emergency?: boolean
          last_verified_at?: string | null
          lat?: number
          lng?: number
          name?: string
          price_max?: number | null
          price_min?: number | null
          price_unit?: string | null
          room_range_end?: string | null
          room_range_start?: string | null
          status?: string
          submitted_by?: string | null
          tour_scene_url?: string | null
          updated_at?: string
          verified_count?: number
        }
        Relationships: []
      }
      class_post_states: {
        Row: {
          note: string | null
          post_id: string
          reminder_offsets: number[] | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          note?: string | null
          post_id: string
          reminder_offsets?: number[] | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          note?: string | null
          post_id?: string
          reminder_offsets?: number[] | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_post_states_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "class_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      class_posts: {
        Row: {
          author_id: string | null
          content_hash: string | null
          course_id: string | null
          created_at: string
          detail: string | null
          due_at: string | null
          edited_at: string | null
          group_id: string
          hidden_by: string | null
          id: string
          kind: string
          pinned: boolean
          requires_submission: boolean
          status: string
          submission_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content_hash?: string | null
          course_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          edited_at?: string | null
          group_id: string
          hidden_by?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          requires_submission?: boolean
          status?: string
          submission_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content_hash?: string | null
          course_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          edited_at?: string | null
          group_id?: string
          hidden_by?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          requires_submission?: boolean
          status?: string
          submission_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_posts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "announcement_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_reps: {
        Row: {
          basis: string | null
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          section_id: string
          status: string
          user_id: string
        }
        Insert: {
          basis?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id: string
          status?: string
          user_id: string
        }
        Update: {
          basis?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_reps_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      commute_areas: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
        }
        Relationships: []
      }
      commute_hubs: {
        Row: {
          created_at: string
          id: string
          kind: string | null
          lat: number
          lng: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string | null
          lat: number
          lng: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string | null
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: []
      }
      commute_legs: {
        Row: {
          base_fare: number
          corridor: string | null
          created_at: string
          duration_minutes: number
          fare_rule_code: string | null
          from_hub_id: string | null
          from_label: string
          geometry: Json | null
          geometry_source: string | null
          id: string
          last_verified_at: string | null
          mode: Database["public"]["Enums"]["transport_mode"]
          notes: string | null
          peak_penalty_minutes: number
          status: string
          submitted_by: string | null
          to_hub_id: string | null
          to_label: string
          updated_at: string
          verified_count: number
        }
        Insert: {
          base_fare?: number
          corridor?: string | null
          created_at?: string
          duration_minutes: number
          fare_rule_code?: string | null
          from_hub_id?: string | null
          from_label: string
          geometry?: Json | null
          geometry_source?: string | null
          id?: string
          last_verified_at?: string | null
          mode: Database["public"]["Enums"]["transport_mode"]
          notes?: string | null
          peak_penalty_minutes?: number
          status?: string
          submitted_by?: string | null
          to_hub_id?: string | null
          to_label: string
          updated_at?: string
          verified_count?: number
        }
        Update: {
          base_fare?: number
          corridor?: string | null
          created_at?: string
          duration_minutes?: number
          fare_rule_code?: string | null
          from_hub_id?: string | null
          from_label?: string
          geometry?: Json | null
          geometry_source?: string | null
          id?: string
          last_verified_at?: string | null
          mode?: Database["public"]["Enums"]["transport_mode"]
          notes?: string | null
          peak_penalty_minutes?: number
          status?: string
          submitted_by?: string | null
          to_hub_id?: string | null
          to_label?: string
          updated_at?: string
          verified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "commute_legs_fare_rule_code_fkey"
            columns: ["fare_rule_code"]
            isOneToOne: false
            referencedRelation: "fare_rules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "commute_legs_from_hub_id_fkey"
            columns: ["from_hub_id"]
            isOneToOne: false
            referencedRelation: "commute_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commute_legs_to_hub_id_fkey"
            columns: ["to_hub_id"]
            isOneToOne: false
            referencedRelation: "commute_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      commute_routes: {
        Row: {
          area_id: string
          created_at: string
          direction: string
          id: string
          label: string | null
          last_verified_at: string | null
          status: string
          submitted_by: string | null
          updated_at: string
          verified_count: number
        }
        Insert: {
          area_id: string
          created_at?: string
          direction?: string
          id?: string
          label?: string | null
          last_verified_at?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          verified_count?: number
        }
        Update: {
          area_id?: string
          created_at?: string
          direction?: string
          id?: string
          label?: string | null
          last_verified_at?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          verified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "commute_routes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "commute_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          id: string
          lab_units: number
          lec_units: number
          program_code: string | null
          title: string
          units: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          lab_units?: number
          lec_units?: number
          program_code?: string | null
          title: string
          units: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          lab_units?: number
          lec_units?: number
          program_code?: string | null
          title?: string
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      deadline_subtasks: {
        Row: {
          created_at: string
          deadline_id: string
          due_at: string | null
          id: string
          is_done: boolean
          ordinal: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline_id: string
          due_at?: string | null
          id?: string
          is_done?: boolean
          ordinal?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline_id?: string
          due_at?: string | null
          id?: string
          is_done?: boolean
          ordinal?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_subtasks_deadline_id_fkey"
            columns: ["deadline_id"]
            isOneToOne: false
            referencedRelation: "deadlines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_subtasks_deadline_id_fkey"
            columns: ["deadline_id"]
            isOneToOne: false
            referencedRelation: "v_deadlines_upcoming"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string
          enrollment_id: string | null
          group_id: string | null
          id: string
          notes: string | null
          reminder_offsets: number[]
          source: string
          source_ref: string | null
          status: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at: string
          enrollment_id?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          reminder_offsets?: number[]
          source?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string
          enrollment_id?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          reminder_offsets?: number[]
          source?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_group_fk"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      departure_plans: {
        Row: {
          adjustments: Json
          arrive_by: string
          base_minutes: number
          class_start: string
          computed_at: string
          explanation: string | null
          first_block_id: string | null
          id: string
          leave_at: string
          peak_minutes: number
          plan_date: string
          route_id: string | null
          user_id: string
          wake_at: string
          weather_minutes: number
        }
        Insert: {
          adjustments?: Json
          arrive_by: string
          base_minutes: number
          class_start: string
          computed_at?: string
          explanation?: string | null
          first_block_id?: string | null
          id?: string
          leave_at: string
          peak_minutes?: number
          plan_date: string
          route_id?: string | null
          user_id: string
          wake_at: string
          weather_minutes?: number
        }
        Update: {
          adjustments?: Json
          arrive_by?: string
          base_minutes?: number
          class_start?: string
          computed_at?: string
          explanation?: string | null
          first_block_id?: string | null
          id?: string
          leave_at?: string
          peak_minutes?: number
          plan_date?: string
          route_id?: string | null
          user_id?: string
          wake_at?: string
          weather_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "departure_plans_first_block_id_fkey"
            columns: ["first_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_plans_first_block_id_fkey"
            columns: ["first_block_id"]
            isOneToOne: false
            referencedRelation: "v_today"
            referencedColumns: ["block_id"]
          },
          {
            foreignKeyName: "departure_plans_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "commute_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_plans_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_route_summary"
            referencedColumns: ["route_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          allowed_absences: number | null
          color_key: number | null
          course_id: string
          created_at: string
          faculty_name: string | null
          id: string
          imported_at: string | null
          lates_per_absence: number | null
          section_id: string | null
          source: string
          term_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_absences?: number | null
          color_key?: number | null
          course_id: string
          created_at?: string
          faculty_name?: string | null
          id?: string
          imported_at?: string | null
          lates_per_absence?: number | null
          section_id?: string | null
          source?: string
          term_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_absences?: number | null
          color_key?: number | null
          course_id?: string
          created_at?: string
          faculty_name?: string | null
          id?: string
          imported_at?: string | null
          lates_per_absence?: number | null
          section_id?: string | null
          source?: string
          term_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_answers: {
        Row: {
          evaluation_id: string
          question_id: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          evaluation_id: string
          question_id: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          evaluation_id?: string
          question_id?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_instruments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          questions: Json
          term_id: string | null
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          questions: Json
          term_id?: string | null
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          questions?: Json
          term_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_instruments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          comment_bullets: string | null
          comment_final: string | null
          completed_at: string | null
          created_at: string
          enrollment_id: string
          faculty_name: string
          id: string
          instrument_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_bullets?: string | null
          comment_final?: string | null
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          faculty_name: string
          id?: string
          instrument_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_bullets?: string | null
          comment_final?: string | null
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          faculty_name?: string
          id?: string
          instrument_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "evaluation_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_rules: {
        Row: {
          code: string
          created_at: string
          discount_pct: number | null
          id: string
          label: string
          matrix: Json | null
          notes: string | null
          rounding: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          discount_pct?: number | null
          id?: string
          label: string
          matrix?: Json | null
          notes?: string | null
          rounding?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          discount_pct?: number | null
          id?: string
          label?: string
          matrix?: Json | null
          notes?: string | null
          rounding?: string
          updated_at?: string
        }
        Relationships: []
      }
      flashcard_reviews: {
        Row: {
          flashcard_id: string
          id: string
          quality: number
          reviewed_at: string
          user_id: string
        }
        Insert: {
          flashcard_id: string
          id?: string
          quality: number
          reviewed_at?: string
          user_id: string
        }
        Update: {
          flashcard_id?: string
          id?: string
          quality?: number
          reviewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string
          created_at: string
          due_on: string
          ease_factor: number
          front: string
          id: string
          interval_days: number
          lapses: number
          pack_id: string
          repetitions: number
          source_chunk_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string
          due_on?: string
          ease_factor?: number
          front: string
          id?: string
          interval_days?: number
          lapses?: number
          pack_id: string
          repetitions?: number
          source_chunk_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          created_at?: string
          due_on?: string
          ease_factor?: number
          front?: string
          id?: string
          interval_days?: number
          lapses?: number
          pack_id?: string
          repetitions?: number
          source_chunk_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "study_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "study_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_components: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          is_complete: boolean
          label: string
          ordinal: number
          score_pct: number | null
          updated_at: string
          user_id: string
          weight_pct: number
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          is_complete?: boolean
          label: string
          ordinal?: number
          score_pct?: number | null
          updated_at?: string
          user_id: string
          weight_pct: number
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          is_complete?: boolean
          label?: string
          ordinal?: number
          score_pct?: number | null
          updated_at?: string
          user_id?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_components_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_scale_mappings: {
        Row: {
          created_at: string
          enrollment_id: string
          grade_value: number
          id: string
          min_pct: number
          user_id: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          grade_value: number
          id?: string
          min_pct: number
          user_id: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          grade_value?: number
          id?: string
          min_pct?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_scale_mappings_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          is_projected: boolean
          mark: string | null
          recorded_at: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          is_projected?: boolean
          mark?: string | null
          recorded_at?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          is_projected?: boolean
          mark?: string | null
          recorded_at?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          claimed_full_name: string | null
          claimed_section_code: string | null
          claimed_student_number: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          claimed_full_name?: string | null
          claimed_section_code?: string | null
          claimed_student_number?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          message?: string | null
          status?: string
          user_id: string
        }
        Update: {
          claimed_full_name?: string | null
          claimed_section_code?: string | null
          claimed_student_number?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          display_name: string | null
          group_id: string
          joined_at: string
          role: string
          shares_availability: boolean
          term_id: string | null
          user_id: string
        }
        Insert: {
          display_name?: string | null
          group_id: string
          joined_at?: string
          role?: string
          shares_availability?: boolean
          term_id?: string | null
          user_id: string
        }
        Update: {
          display_name?: string | null
          group_id?: string
          joined_at?: string
          role?: string
          shares_availability?: boolean
          term_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived_at: string | null
          campus: string | null
          course_id: string | null
          created_at: string
          created_by: string
          id: string
          invite_code: string
          kind: string
          name: string
          program_code: string | null
          section_code: string | null
          term_id: string | null
          who_can_post: string
          year_level: number | null
        }
        Insert: {
          archived_at?: string | null
          campus?: string | null
          course_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          kind?: string
          name: string
          program_code?: string | null
          section_code?: string | null
          term_id?: string | null
          who_can_post?: string
          year_level?: number | null
        }
        Update: {
          archived_at?: string | null
          campus?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          kind?: string
          name?: string
          program_code?: string | null
          section_code?: string | null
          term_id?: string | null
          who_can_post?: string
          year_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          ordinal: number
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          ordinal: number
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          ordinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          program_code: string | null
          source_note: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          program_code?: string | null
          source_note?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          program_code?: string | null
          source_note?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      moderation_queue: {
        Row: {
          created_at: string
          entity: string
          entity_id: string
          id: string
          reason: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          reason: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          reason?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      notification_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      peak_bands: {
        Row: {
          corridor: string
          created_at: string
          days: Database["public"]["Enums"]["weekday"][]
          end_time: string
          id: string
          penalty_minutes: number
          severity: string
          start_time: string
        }
        Insert: {
          corridor: string
          created_at?: string
          days: Database["public"]["Enums"]["weekday"][]
          end_time: string
          id?: string
          penalty_minutes: number
          severity?: string
          start_time: string
        }
        Update: {
          corridor?: string
          created_at?: string
          days?: Database["public"]["Enums"]["weekday"][]
          end_time?: string
          id?: string
          penalty_minutes?: number
          severity?: string
          start_time?: string
        }
        Relationships: []
      }
      place_corrections: {
        Row: {
          created_at: string
          field: string
          id: string
          note: string | null
          place_id: string
          proposed: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          note?: string | null
          place_id: string
          proposed: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          note?: string | null
          place_id?: string
          proposed?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_corrections_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_places"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_questions: {
        Row: {
          answer: string
          created_at: string
          difficulty: string | null
          explanation: string | null
          id: string
          pack_id: string
          question: string
          source_chunk_id: string | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          pack_id: string
          question: string
          source_chunk_id?: string | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          pack_id?: string
          question?: string
          source_chunk_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_questions_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "study_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_questions_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "study_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_reports: {
        Row: {
          college: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          ip_hash: string | null
          kind: string
          message: string
          section: string | null
          status: string
          student_number: string | null
          subject: string
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          college?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          ip_hash?: string | null
          kind: string
          message: string
          section?: string | null
          status?: string
          student_number?: string | null
          subject: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          college?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          ip_hash?: string | null
          kind?: string
          message?: string
          section?: string | null
          status?: string
          student_number?: string | null
          subject?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          campus: string
          created_at: string
          full_name: string | null
          id: string
          locale: string
          onboarded_at: string | null
          program_code: string | null
          section_label: string | null
          student_number: string | null
          updated_at: string
          year_level: number | null
        }
        Insert: {
          campus?: string
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          onboarded_at?: string | null
          program_code?: string | null
          section_label?: string | null
          student_number?: string | null
          updated_at?: string
          year_level?: number | null
        }
        Update: {
          campus?: string
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          onboarded_at?: string | null
          program_code?: string | null
          section_label?: string | null
          student_number?: string | null
          updated_at?: string
          year_level?: number | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: string
          outcome: string
          user_id: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          outcome?: string
          user_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          outcome?: string
          user_id?: string | null
        }
        Relationships: []
      }
      route_legs: {
        Row: {
          leg_id: string
          ordinal: number
          route_id: string
        }
        Insert: {
          leg_id: string
          ordinal: number
          route_id: string
        }
        Update: {
          leg_id?: string
          ordinal?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_legs_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "commute_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_legs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "commute_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_legs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_route_summary"
            referencedColumns: ["route_id"]
          },
        ]
      }
      route_verifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          leg_id: string | null
          note: string | null
          route_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          leg_id?: string | null
          note?: string | null
          route_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          leg_id?: string | null
          note?: string | null
          route_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_verifications_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "commute_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_verifications_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "commute_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_verifications_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_route_summary"
            referencedColumns: ["route_id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          created_at: string
          day: Database["public"]["Enums"]["weekday"]
          end_time: string
          enrollment_id: string | null
          id: string
          parse_status: string
          prompt_attendance: boolean
          raw_schedule: string | null
          room: string | null
          source: string
          start_time: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: Database["public"]["Enums"]["weekday"]
          end_time: string
          enrollment_id?: string | null
          id?: string
          parse_status?: string
          prompt_attendance?: boolean
          raw_schedule?: string | null
          room?: string | null
          source?: string
          start_time: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: Database["public"]["Enums"]["weekday"]
          end_time?: string
          enrollment_id?: string | null
          id?: string
          parse_status?: string
          prompt_attendance?: boolean
          raw_schedule?: string | null
          room?: string | null
          source?: string
          start_time?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_rejections: {
        Row: {
          change_hash: string
          change_kind: string
          course_code: string
          created_at: string
          id: string
          term_id: string
          user_id: string
        }
        Insert: {
          change_hash: string
          change_kind: string
          course_code: string
          created_at?: string
          id?: string
          term_id: string
          user_id: string
        }
        Update: {
          change_hash?: string
          change_kind?: string
          course_code?: string
          created_at?: string
          id?: string
          term_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_rejections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_notifications: {
        Row: {
          cancelled_at: string | null
          created_at: string
          entity: string
          entity_id: string | null
          fire_at: string
          id: string
          kind: string
          payload: Json
          sent_at: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          fire_at: string
          id?: string
          kind: string
          payload?: Json
          sent_at?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          fire_at?: string
          id?: string
          kind?: string
          payload?: Json
          sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          checksum: string
          version: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          version: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          version?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          course_id: string
          created_at: string
          faculty_name: string | null
          id: string
          label: string
          term_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          faculty_name?: string | null
          id?: string
          label: string
          term_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          faculty_name?: string | null
          id?: string
          label?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          ordinal: number
          pack_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          ordinal: number
          pack_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          ordinal?: number
          pack_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_chunks_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "study_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      study_packs: {
        Row: {
          created_at: string
          enrollment_id: string | null
          id: string
          key_concepts: Json | null
          model_used: string | null
          prompt_version: string | null
          source_name: string | null
          source_path: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enrollment_id?: string | null
          id?: string
          key_concepts?: Json | null
          model_used?: string | null
          prompt_version?: string | null
          source_name?: string | null
          source_path?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string | null
          id?: string
          key_concepts?: Json | null
          model_used?: string | null
          prompt_version?: string | null
          source_name?: string | null
          source_path?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_packs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          enrollment_id: string | null
          id: string
          mode: string
          pack_id: string | null
          score: number | null
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          enrollment_id?: string | null
          id?: string
          mode: string
          pack_id?: string | null
          score?: number | null
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          enrollment_id?: string | null
          id?: string
          mode?: string
          pack_id?: string | null
          score?: number | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "study_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      suspension_advisories: {
        Row: {
          city: string | null
          created_at: string
          effective_on: string
          headline: string
          id: string
          level: string | null
          scope: string
          source: string
          source_url: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          effective_on: string
          headline: string
          id?: string
          level?: string | null
          scope: string
          source: string
          source_url?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          effective_on?: string
          headline?: string
          id?: string
          level?: string | null
          scope?: string
          source?: string
          source_url?: string | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          created_at: string
          error_code: string | null
          error_detail: string | null
          finished_at: string | null
          id: string
          importer: string
          kind: string
          parser_version: string | null
          rows_failed: number | null
          rows_parsed: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          importer?: string
          kind: string
          parser_version?: string | null
          rows_failed?: number | null
          rows_parsed?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          importer?: string
          kind?: string
          parser_version?: string | null
          rows_failed?: number | null
          rows_parsed?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          academic_year: string
          code: string
          created_at: string
          ends_on: string | null
          id: string
          is_current: boolean
          label: string
          ordinal: number
          starts_on: string | null
        }
        Insert: {
          academic_year: string
          code: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          label: string
          ordinal: number
          starts_on?: string | null
        }
        Update: {
          academic_year?: string
          code?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          label?: string
          ordinal?: number
          starts_on?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          apply_peak_adjustment: boolean
          apply_weather_adjustment: boolean
          arrive_early_minutes: number
          attendance_prompt_delay: number
          created_at: string
          day_end: string
          day_start: string
          default_allowed_absences: number
          default_route_id: string | null
          home_area_id: string | null
          lates_per_absence: number
          notification_settings: Json
          preparation_minutes: number
          quiet_hours_end: string
          quiet_hours_start: string
          updated_at: string
          user_id: string
          weather_buffer_minutes: number
          weather_threshold_pct: number
          week_starts_monday: boolean
        }
        Insert: {
          apply_peak_adjustment?: boolean
          apply_weather_adjustment?: boolean
          arrive_early_minutes?: number
          attendance_prompt_delay?: number
          created_at?: string
          day_end?: string
          day_start?: string
          default_allowed_absences?: number
          default_route_id?: string | null
          home_area_id?: string | null
          lates_per_absence?: number
          notification_settings?: Json
          preparation_minutes?: number
          quiet_hours_end?: string
          quiet_hours_start?: string
          updated_at?: string
          user_id: string
          weather_buffer_minutes?: number
          weather_threshold_pct?: number
          week_starts_monday?: boolean
        }
        Update: {
          apply_peak_adjustment?: boolean
          apply_weather_adjustment?: boolean
          arrive_early_minutes?: number
          attendance_prompt_delay?: number
          created_at?: string
          day_end?: string
          day_start?: string
          default_allowed_absences?: number
          default_route_id?: string | null
          home_area_id?: string | null
          lates_per_absence?: number
          notification_settings?: Json
          preparation_minutes?: number
          quiet_hours_end?: string
          quiet_hours_start?: string
          updated_at?: string
          user_id?: string
          weather_buffer_minutes?: number
          weather_threshold_pct?: number
          week_starts_monday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_default_route_fk"
            columns: ["default_route_id"]
            isOneToOne: false
            referencedRelation: "commute_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_default_route_fk"
            columns: ["default_route_id"]
            isOneToOne: false
            referencedRelation: "v_route_summary"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "user_preferences_home_area_fk"
            columns: ["home_area_id"]
            isOneToOne: false
            referencedRelation: "commute_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_thresholds: {
        Row: {
          active: boolean
          comparator: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["threshold_kind"]
          label: string
          last_state: Database["public"]["Enums"]["threshold_state"] | null
          scope: Database["public"]["Enums"]["threshold_scope"]
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          active?: boolean
          comparator: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["threshold_kind"]
          label: string
          last_state?: Database["public"]["Enums"]["threshold_state"] | null
          scope?: Database["public"]["Enums"]["threshold_scope"]
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          active?: boolean
          comparator?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["threshold_kind"]
          label?: string
          last_state?: Database["public"]["Enums"]["threshold_state"] | null
          scope?: Database["public"]["Enums"]["threshold_scope"]
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_attendance_summary: {
        Row: {
          absence_units: number | null
          absent_count: number | null
          allowed: number | null
          enrollment_id: string | null
          excused_count: number | null
          late_count: number | null
          lates_per_absence: number | null
          present_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_deadlines_upcoming: {
        Row: {
          completed_at: string | null
          course_code: string | null
          course_title: string | null
          created_at: string | null
          due_at: string | null
          enrollment_id: string | null
          group_id: string | null
          hours_left: number | null
          id: string | null
          notes: string | null
          reminder_offsets: number[] | null
          source: string | null
          source_ref: string | null
          status: Database["public"]["Enums"]["deadline_status"] | null
          title: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_group_fk"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v_gwa: {
        Row: {
          graded_courses: number | null
          graded_units: number | null
          gwa: number | null
          includes_projection: boolean | null
          term_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_route_summary: {
        Row: {
          area_id: string | null
          base_minutes: number | null
          direction: string | null
          fare_regular: number | null
          fare_student: number | null
          freshness: string | null
          label: string | null
          last_verified_at: string | null
          route_id: string | null
          status: string | null
          transfers: number | null
          verified_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commute_routes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "commute_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_today: {
        Row: {
          attendance_id: string | null
          attendance_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          block_id: string | null
          color_key: number | null
          course_title: string | null
          day: Database["public"]["Enums"]["weekday"] | null
          end_time: string | null
          enrollment_id: string | null
          faculty_name: string | null
          label: string | null
          prompt_attendance: boolean | null
          room: string | null
          source: string | null
          start_time: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      attach_updated_at: { Args: { target: unknown }; Returns: undefined }
      claim_classroom_ownership: {
        Args: { target_group: string }
        Returns: undefined
      }
      classroom_by_invite: {
        Args: { invite: string }
        Returns: {
          archived: boolean
          campus: string
          id: string
          member_count: number
          rep_name: string
          section_code: string
          term_id: string
          term_label: string
        }[]
      }
      commit_schedule: {
        Args: {
          p_courses: Json
          p_job_id: string
          p_source: string
          p_term_code: string
        }
        Returns: Json
      }
      decide_join_request: {
        Args: { approve: boolean; request: string }
        Returns: undefined
      }
      is_group_member: { Args: { target_group: string }; Returns: boolean }
      is_group_rep: { Args: { target_group: string }; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          program_filter?: string
          query_embedding: string
          similarity_floor?: number
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          similarity: number
          source_title: string
          source_url: string
        }[]
      }
      remove_classroom_member: {
        Args: { target_group: string; target_user: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { new_role: string; target_group: string; target_user: string }
        Returns: undefined
      }
    }
    Enums: {
      announcement_type:
        | "exam"
        | "quiz"
        | "deadline"
        | "room_change"
        | "suspension"
        | "schedule_change"
        | "general"
      attendance_status: "present" | "absent" | "late" | "excused" | "cancelled"
      deadline_status: "open" | "done" | "dismissed"
      place_category:
        | "building"
        | "gate"
        | "printing"
        | "food"
        | "study"
        | "service"
        | "landmark"
      threshold_kind: "gwa" | "absence"
      threshold_scope: "term" | "cumulative"
      threshold_state: "clear" | "at_risk" | "breached"
      transport_mode:
        | "walk"
        | "jeep"
        | "bus"
        | "uv_express"
        | "rail"
        | "tricycle"
        | "taxi"
        | "tnvs"
      trust_level: "official" | "verified" | "community"
      weekday:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_type: [
        "exam",
        "quiz",
        "deadline",
        "room_change",
        "suspension",
        "schedule_change",
        "general",
      ],
      attendance_status: ["present", "absent", "late", "excused", "cancelled"],
      deadline_status: ["open", "done", "dismissed"],
      place_category: [
        "building",
        "gate",
        "printing",
        "food",
        "study",
        "service",
        "landmark",
      ],
      threshold_kind: ["gwa", "absence"],
      threshold_scope: ["term", "cumulative"],
      threshold_state: ["clear", "at_risk", "breached"],
      transport_mode: [
        "walk",
        "jeep",
        "bus",
        "uv_express",
        "rail",
        "tricycle",
        "taxi",
        "tnvs",
      ],
      trust_level: ["official", "verified", "community"],
      weekday: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
  },
} as const

