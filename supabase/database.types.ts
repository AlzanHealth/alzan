export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_files: {
        Row: {
          file_hash: string | null
          file_type: string
          id: string
          imported_at: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id: string | null
          session_id: string | null
          size_bytes: number | null
          source_channel: string | null
          source_package: string | null
          storage_bucket: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          file_hash?: string | null
          file_type: string
          id?: string
          imported_at?: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id?: string | null
          session_id?: string | null
          size_bytes?: number | null
          source_channel?: string | null
          source_package?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          file_hash?: string | null
          file_type?: string
          id?: string
          imported_at?: string
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id?: string | null
          session_id?: string | null
          size_bytes?: number | null
          source_channel?: string | null
          source_package?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_files_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_heart_rate_zones: {
        Row: {
          created_at: string
          duration_s: number
          id: string
          percentage: number
          session_id: string
          zone: number
        }
        Insert: {
          created_at?: string
          duration_s: number
          id?: string
          percentage: number
          session_id: string
          zone: number
        }
        Update: {
          created_at?: string
          duration_s?: number
          id?: string
          percentage?: number
          session_id?: string
          zone?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_heart_rate_zones_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_laps: {
        Row: {
          avg_heart_rate: number | null
          avg_pace_s_per_km: number | null
          distance_m: number | null
          duration_s: number | null
          end_offset_s: number | null
          id: string
          lap_index: number
          lap_type: Database["public"]["Enums"]["lap_type_enum"]
          max_heart_rate: number | null
          session_id: string
          split_distance_m: number | null
          split_group: string
          split_group_order: number
          start_offset_s: number | null
          user_id: string | null
        }
        Insert: {
          avg_heart_rate?: number | null
          avg_pace_s_per_km?: number | null
          distance_m?: number | null
          duration_s?: number | null
          end_offset_s?: number | null
          id?: string
          lap_index: number
          lap_type?: Database["public"]["Enums"]["lap_type_enum"]
          max_heart_rate?: number | null
          session_id: string
          split_distance_m?: number | null
          split_group?: string
          split_group_order?: number
          start_offset_s?: number | null
          user_id?: string | null
        }
        Update: {
          avg_heart_rate?: number | null
          avg_pace_s_per_km?: number | null
          distance_m?: number | null
          duration_s?: number | null
          end_offset_s?: number | null
          id?: string
          lap_index?: number
          lap_type?: Database["public"]["Enums"]["lap_type_enum"]
          max_heart_rate?: number | null
          session_id?: string
          split_distance_m?: number | null
          split_group?: string
          split_group_order?: number
          start_offset_s?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_laps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_provider_fields: {
        Row: {
          created_at: string
          fields: Json
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_metadata: Json | null
          session_id: string
          source_channel: string | null
          source_package: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_metadata?: Json | null
          session_id: string
          source_channel?: string | null
          source_package?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fields?: Json
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_metadata?: Json | null
          session_id?: string
          source_channel?: string | null
          source_package?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_provider_fields_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_provider_fields_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_route_points: {
        Row: {
          altitude_m: number | null
          created_at: string
          distance_m: number | null
          horizontal_accuracy_m: number | null
          id: string
          lat: number
          lon: number
          offset_s: number | null
          point_index: number
          raw_payload: Json | null
          raw_payload_id: string | null
          session_id: string
          source: string | null
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          speed_mps: number | null
          timestamp: string | null
          user_id: string
          vertical_accuracy_m: number | null
        }
        Insert: {
          altitude_m?: number | null
          created_at?: string
          distance_m?: number | null
          horizontal_accuracy_m?: number | null
          id?: string
          lat: number
          lon: number
          offset_s?: number | null
          point_index: number
          raw_payload?: Json | null
          raw_payload_id?: string | null
          session_id: string
          source?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          speed_mps?: number | null
          timestamp?: string | null
          user_id: string
          vertical_accuracy_m?: number | null
        }
        Update: {
          altitude_m?: number | null
          created_at?: string
          distance_m?: number | null
          horizontal_accuracy_m?: number | null
          id?: string
          lat?: number
          lon?: number
          offset_s?: number | null
          point_index?: number
          raw_payload?: Json | null
          raw_payload_id?: string | null
          session_id?: string
          source?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          speed_mps?: number | null
          timestamp?: string | null
          user_id?: string
          vertical_accuracy_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_route_points_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_route_points_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_route_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_session_superset_links: {
        Row: {
          created_at: string
          from_exercise_id: string
          from_order_index: number
          id: string
          session_id: string
          to_exercise_id: string
          to_order_index: number
        }
        Insert: {
          created_at?: string
          from_exercise_id: string
          from_order_index: number
          id?: string
          session_id: string
          to_exercise_id: string
          to_order_index: number
        }
        Update: {
          created_at?: string
          from_exercise_id?: string
          from_order_index?: number
          id?: string
          session_id?: string
          to_exercise_id?: string
          to_order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_session_superset_links_from_exercise_id_fkey"
            columns: ["from_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_session_superset_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_session_superset_links_to_exercise_id_fkey"
            columns: ["to_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_session_tags: {
        Row: {
          created_at: string
          session_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          session_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          session_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_session_tags_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_session_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sessions: {
        Row: {
          avg_cadence: number | null
          avg_heart_rate: number | null
          avg_power_w: number | null
          avg_speed_m_per_s: number | null
          avg_temp_c: number | null
          base_load: string | null
          board: string | null
          boots_used: string | null
          calories_kcal: number | null
          climbing_grade: string | null
          contact_level: string | null
          created_at: string
          description: string | null
          device_id: string | null
          distance_m: number | null
          duration_s: number | null
          elev_gain_m: number | null
          elev_loss_m: number | null
          end_time: string | null
          ended_at_local: string | null
          endurance_template_id: string | null
          epoc: number | null
          football_session_type: string | null
          id: string
          imported_at: string | null
          max_cadence: number | null
          max_heart_rate: number | null
          max_power_w: number | null
          max_temp_c: number | null
          min_heart_rate: number | null
          name: string | null
          notes: string | null
          pool_type: string | null
          provider: Database["public"]["Enums"]["provider_enum"]
          provider_activity_id: string | null
          pte: number | null
          racket_used: string | null
          raw_payload_id: string | null
          recovery_time_s: number | null
          rival: string | null
          route_polyline: string | null
          rpe: number | null
          ski_type: string | null
          slope_type: string | null
          source: Database["public"]["Enums"]["activity_source_enum"]
          source_channel: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          source_updated_at: string | null
          sport_subtype: string | null
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          start_time: string
          started_at_local: string | null
          status: Database["public"]["Enums"]["activity_status_enum"]
          stroke: string | null
          surface: string | null
          timezone: string | null
          total_reps: number | null
          total_sets: number | null
          total_steps: number | null
          total_volume_kg: number | null
          tss_hr: number | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["visibility_enum"] | null
          vo2_max: number | null
          wetsuit: string | null
          workout_template_id: string | null
        }
        Insert: {
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_power_w?: number | null
          avg_speed_m_per_s?: number | null
          avg_temp_c?: number | null
          base_load?: string | null
          board?: string | null
          boots_used?: string | null
          calories_kcal?: number | null
          climbing_grade?: string | null
          contact_level?: string | null
          created_at?: string
          description?: string | null
          device_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          elev_gain_m?: number | null
          elev_loss_m?: number | null
          end_time?: string | null
          ended_at_local?: string | null
          endurance_template_id?: string | null
          epoc?: number | null
          football_session_type?: string | null
          id?: string
          imported_at?: string | null
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_power_w?: number | null
          max_temp_c?: number | null
          min_heart_rate?: number | null
          name?: string | null
          notes?: string | null
          pool_type?: string | null
          provider?: Database["public"]["Enums"]["provider_enum"]
          provider_activity_id?: string | null
          pte?: number | null
          racket_used?: string | null
          raw_payload_id?: string | null
          recovery_time_s?: number | null
          rival?: string | null
          route_polyline?: string | null
          rpe?: number | null
          ski_type?: string | null
          slope_type?: string | null
          source?: Database["public"]["Enums"]["activity_source_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          sport_subtype?: string | null
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          start_time?: string
          started_at_local?: string | null
          status?: Database["public"]["Enums"]["activity_status_enum"]
          stroke?: string | null
          surface?: string | null
          timezone?: string | null
          total_reps?: number | null
          total_sets?: number | null
          total_steps?: number | null
          total_volume_kg?: number | null
          tss_hr?: number | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["visibility_enum"] | null
          vo2_max?: number | null
          wetsuit?: string | null
          workout_template_id?: string | null
        }
        Update: {
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_power_w?: number | null
          avg_speed_m_per_s?: number | null
          avg_temp_c?: number | null
          base_load?: string | null
          board?: string | null
          boots_used?: string | null
          calories_kcal?: number | null
          climbing_grade?: string | null
          contact_level?: string | null
          created_at?: string
          description?: string | null
          device_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          elev_gain_m?: number | null
          elev_loss_m?: number | null
          end_time?: string | null
          ended_at_local?: string | null
          endurance_template_id?: string | null
          epoc?: number | null
          football_session_type?: string | null
          id?: string
          imported_at?: string | null
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_power_w?: number | null
          max_temp_c?: number | null
          min_heart_rate?: number | null
          name?: string | null
          notes?: string | null
          pool_type?: string | null
          provider?: Database["public"]["Enums"]["provider_enum"]
          provider_activity_id?: string | null
          pte?: number | null
          racket_used?: string | null
          raw_payload_id?: string | null
          recovery_time_s?: number | null
          rival?: string | null
          route_polyline?: string | null
          rpe?: number | null
          ski_type?: string | null
          slope_type?: string | null
          source?: Database["public"]["Enums"]["activity_source_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          sport_subtype?: string | null
          sport_type?: Database["public"]["Enums"]["sport_type_enum"]
          start_time?: string
          started_at_local?: string | null
          status?: Database["public"]["Enums"]["activity_status_enum"]
          stroke?: string | null
          surface?: string | null
          timezone?: string | null
          total_reps?: number | null
          total_sets?: number | null
          total_steps?: number | null
          total_volume_kg?: number | null
          tss_hr?: number | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["visibility_enum"] | null
          vo2_max?: number | null
          wetsuit?: string | null
          workout_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_endurance_template_id_fkey"
            columns: ["endurance_template_id"]
            isOneToOne: false
            referencedRelation: "endurance_workout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_stream_samples: {
        Row: {
          created_at: string
          id: string
          offset_s: number | null
          raw_payload: Json | null
          raw_payload_id: string | null
          session_id: string
          source: string | null
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          stream_type: Database["public"]["Enums"]["stream_type_enum"]
          timestamp: string | null
          unit: string | null
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          offset_s?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          session_id: string
          source?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stream_type: Database["public"]["Enums"]["stream_type_enum"]
          timestamp?: string | null
          unit?: string | null
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          offset_s?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          session_id?: string
          source?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stream_type?: Database["public"]["Enums"]["stream_type_enum"]
          timestamp?: string | null
          unit?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_stream_samples_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_stream_samples_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_stream_samples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_streams: {
        Row: {
          created_at: string
          data: Json
          id: string
          raw_payload_id: string | null
          sample_hz: number | null
          session_id: string
          source: string
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          stream_type: Database["public"]["Enums"]["stream_type_enum"]
          unit: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          raw_payload_id?: string | null
          sample_hz?: number | null
          session_id: string
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stream_type: Database["public"]["Enums"]["stream_type_enum"]
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          raw_payload_id?: string | null
          sample_hz?: number | null
          session_id?: string
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stream_type?: Database["public"]["Enums"]["stream_type_enum"]
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_streams_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_streams_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurements: {
        Row: {
          id: string
          measured_at: string
          measurement_type: Database["public"]["Enums"]["measurement_type_enum"]
          notes: string | null
          user_id: string
          value_cm: number
        }
        Insert: {
          id?: string
          measured_at?: string
          measurement_type: Database["public"]["Enums"]["measurement_type_enum"]
          notes?: string | null
          user_id: string
          value_cm: number
        }
        Update: {
          id?: string
          measured_at?: string
          measurement_type?: Database["public"]["Enums"]["measurement_type_enum"]
          notes?: string | null
          user_id?: string
          value_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_hydration: {
        Row: {
          date: string
          source: Database["public"]["Enums"]["daily_hydration_source"]
          total_ml: number
          updated_at: string
          user_id: string
        }
        Insert: {
          date: string
          source?: Database["public"]["Enums"]["daily_hydration_source"]
          total_ml?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          date?: string
          source?: Database["public"]["Enums"]["daily_hydration_source"]
          total_ml?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_hydration_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_recovery: {
        Row: {
          ans_charge: number | null
          avg_hrv_ms: number | null
          body_battery_end: number | null
          body_battery_max: number | null
          body_battery_min: number | null
          body_battery_start: number | null
          created_at: string
          data_quality:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          hrv_balance_score: number | null
          id: string
          nightly_recharge_score: number | null
          raw_payload: Json | null
          raw_payload_id: string | null
          readiness_score: number | null
          recommendation: string | null
          recovery_label: string | null
          recovery_score: number | null
          respiratory_rate_rpm: number | null
          resting_hr_bpm: number | null
          sleep_charge: number | null
          sleep_score: number | null
          sleep_session_id: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          spo2_avg_pct: number | null
          strain_score: number | null
          synced_at: string
          temp_deviation_c: number | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ans_charge?: number | null
          avg_hrv_ms?: number | null
          body_battery_end?: number | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          body_battery_start?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          hrv_balance_score?: number | null
          id?: string
          nightly_recharge_score?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          readiness_score?: number | null
          recommendation?: string | null
          recovery_label?: string | null
          recovery_score?: number | null
          respiratory_rate_rpm?: number | null
          resting_hr_bpm?: number | null
          sleep_charge?: number | null
          sleep_score?: number | null
          sleep_session_id?: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          spo2_avg_pct?: number | null
          strain_score?: number | null
          synced_at?: string
          temp_deviation_c?: number | null
          timezone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ans_charge?: number | null
          avg_hrv_ms?: number | null
          body_battery_end?: number | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          body_battery_start?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date?: string
          hrv_balance_score?: number | null
          id?: string
          nightly_recharge_score?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          readiness_score?: number | null
          recommendation?: string | null
          recovery_label?: string | null
          recovery_score?: number | null
          respiratory_rate_rpm?: number | null
          resting_hr_bpm?: number | null
          sleep_charge?: number | null
          sleep_score?: number | null
          sleep_session_id?: string | null
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          spo2_avg_pct?: number | null
          strain_score?: number | null
          synced_at?: string
          temp_deviation_c?: number | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_recovery_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_recovery_sleep_session_id_fkey"
            columns: ["sleep_session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_recovery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_steps: {
        Row: {
          active_calories_kcal: number | null
          active_distance_m: number | null
          active_steps: number | null
          calories_kcal: number | null
          created_at: string
          data_quality:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          device_id: string | null
          distance_m: number | null
          elevation_gain_m: number | null
          fairly_active_min: number | null
          first_step_at: string | null
          floors_climbed: number | null
          goal_achieved: boolean | null
          id: string
          is_manual: boolean
          last_step_at: string | null
          lightly_active_min: number | null
          raw_payload: Json | null
          raw_payload_id: string | null
          running_steps: number | null
          sedentary_minutes: number | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_created_at: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          source_updated_at: string | null
          step_goal: number | null
          synced_at: string
          timezone: string
          total_steps: number
          updated_at: string
          user_id: string
          very_active_min: number | null
          walking_steps: number | null
        }
        Insert: {
          active_calories_kcal?: number | null
          active_distance_m?: number | null
          active_steps?: number | null
          calories_kcal?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          device_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          fairly_active_min?: number | null
          first_step_at?: string | null
          floors_climbed?: number | null
          goal_achieved?: boolean | null
          id?: string
          is_manual?: boolean
          last_step_at?: string | null
          lightly_active_min?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          running_steps?: number | null
          sedentary_minutes?: number | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_created_at?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          step_goal?: number | null
          synced_at?: string
          timezone: string
          total_steps: number
          updated_at?: string
          user_id: string
          very_active_min?: number | null
          walking_steps?: number | null
        }
        Update: {
          active_calories_kcal?: number | null
          active_distance_m?: number | null
          active_steps?: number | null
          calories_kcal?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date?: string
          device_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          fairly_active_min?: number | null
          first_step_at?: string | null
          floors_climbed?: number | null
          goal_achieved?: boolean | null
          id?: string
          is_manual?: boolean
          last_step_at?: string | null
          lightly_active_min?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          running_steps?: number | null
          sedentary_minutes?: number | null
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_created_at?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          step_goal?: number | null
          synced_at?: string
          timezone?: string
          total_steps?: number
          updated_at?: string
          user_id?: string
          very_active_min?: number | null
          walking_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_steps_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_steps_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_steps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_model: string | null
          device_name: string | null
          device_serial: string | null
          id: string
          provider: Database["public"]["Enums"]["provider_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          device_serial?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["provider_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          device_serial?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["provider_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_meal_translations: {
        Row: {
          diet_template_meal_id: string | null
          id: string
          language_code:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name: string
          notes: string | null
        }
        Insert: {
          diet_template_meal_id?: string | null
          id?: string
          language_code?:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name: string
          notes?: string | null
        }
        Update: {
          diet_template_meal_id?: string | null
          id?: string
          language_code?:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_meal_translations_diet_template_meal_id_fkey"
            columns: ["diet_template_meal_id"]
            isOneToOne: false
            referencedRelation: "diet_template_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_meals: {
        Row: {
          base_name: string
          day_of_week: number
          diet_template_id: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          notes: string | null
          order_index: number
          target_carbs_g: number | null
          target_fats_g: number | null
          target_kcal: number | null
          target_protein_g: number | null
          user_id: string | null
        }
        Insert: {
          base_name: string
          day_of_week: number
          diet_template_id: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          notes?: string | null
          order_index?: number
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          user_id?: string | null
        }
        Update: {
          base_name?: string
          day_of_week?: number
          diet_template_id?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type_enum"]
          notes?: string | null
          order_index?: number
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_meals_diet_template_id_fkey"
            columns: ["diet_template_id"]
            isOneToOne: false
            referencedRelation: "diet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_template_translations: {
        Row: {
          description: string | null
          diet_template_id: string | null
          id: string
          language_code:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name: string
        }
        Insert: {
          description?: string | null
          diet_template_id?: string | null
          id?: string
          language_code?:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name: string
        }
        Update: {
          description?: string | null
          diet_template_id?: string | null
          id?: string
          language_code?:
            | Database["public"]["Enums"]["language_code_enum"]
            | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_template_translations_diet_template_id_fkey"
            columns: ["diet_template_id"]
            isOneToOne: false
            referencedRelation: "diet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_templates: {
        Row: {
          base_name: string
          created_at: string
          daily_calorie_target_kcal: number | null
          description: string | null
          id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_name: string
          created_at?: string
          daily_calorie_target_kcal?: number | null
          description?: string | null
          id?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_name?: string
          created_at?: string
          daily_calorie_target_kcal?: number | null
          description?: string | null
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      endurance_workout_steps: {
        Row: {
          created_at: string
          distance_m: number | null
          duration_s: number | null
          duration_type: Database["public"]["Enums"]["duration_type_enum"]
          id: string
          is_group: boolean | null
          order_index: number
          parent_step_id: string | null
          phase_type: Database["public"]["Enums"]["phase_type_enum"]
          repetitions: number | null
          target_max: number | null
          target_min: number | null
          target_type: Database["public"]["Enums"]["target_type_enum"]
          template_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          duration_type: Database["public"]["Enums"]["duration_type_enum"]
          id?: string
          is_group?: boolean | null
          order_index: number
          parent_step_id?: string | null
          phase_type: Database["public"]["Enums"]["phase_type_enum"]
          repetitions?: number | null
          target_max?: number | null
          target_min?: number | null
          target_type?: Database["public"]["Enums"]["target_type_enum"]
          template_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          duration_type?: Database["public"]["Enums"]["duration_type_enum"]
          id?: string
          is_group?: boolean | null
          order_index?: number
          parent_step_id?: string | null
          phase_type?: Database["public"]["Enums"]["phase_type_enum"]
          repetitions?: number | null
          target_max?: number | null
          target_min?: number | null
          target_type?: Database["public"]["Enums"]["target_type_enum"]
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endurance_workout_steps_parent_step_id_fkey"
            columns: ["parent_step_id"]
            isOneToOne: false
            referencedRelation: "endurance_workout_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endurance_workout_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "endurance_workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      endurance_workout_templates: {
        Row: {
          base_load: string | null
          base_name: string
          board: string | null
          boots_used: string | null
          climbing_grade: string | null
          contact_level: string | null
          created_at: string
          description: string | null
          elev_gain_m: number | null
          environment_type: string | null
          football_session_type: string | null
          id: string
          notes: string | null
          pool_type: string | null
          racket_used: string | null
          rival: string | null
          scheduled_day: number | null
          ski_type: string | null
          slope_type: string | null
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          stroke: string | null
          surface: string | null
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
          user_id: string
          wetsuit: string | null
          workout_goal: string | null
        }
        Insert: {
          base_load?: string | null
          base_name: string
          board?: string | null
          boots_used?: string | null
          climbing_grade?: string | null
          contact_level?: string | null
          created_at?: string
          description?: string | null
          elev_gain_m?: number | null
          environment_type?: string | null
          football_session_type?: string | null
          id?: string
          notes?: string | null
          pool_type?: string | null
          racket_used?: string | null
          rival?: string | null
          scheduled_day?: number | null
          ski_type?: string | null
          slope_type?: string | null
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          stroke?: string | null
          surface?: string | null
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          user_id: string
          wetsuit?: string | null
          workout_goal?: string | null
        }
        Update: {
          base_load?: string | null
          base_name?: string
          board?: string | null
          boots_used?: string | null
          climbing_grade?: string | null
          contact_level?: string | null
          created_at?: string
          description?: string | null
          elev_gain_m?: number | null
          environment_type?: string | null
          football_session_type?: string | null
          id?: string
          notes?: string | null
          pool_type?: string | null
          racket_used?: string | null
          rival?: string | null
          scheduled_day?: number | null
          ski_type?: string | null
          slope_type?: string | null
          sport_type?: Database["public"]["Enums"]["sport_type_enum"]
          stroke?: string | null
          surface?: string | null
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          user_id?: string
          wetsuit?: string | null
          workout_goal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endurance_workout_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          code: string
          id: number
        }
        Insert: {
          code: string
          id?: number
        }
        Update: {
          code?: string
          id?: number
        }
        Relationships: []
      }
      equipment_translations: {
        Row: {
          equipment_id: number | null
          id: string
          language_code: string | null
          name: string
        }
        Insert: {
          equipment_id?: number | null
          id?: string
          language_code?: string | null
          name: string
        }
        Update: {
          equipment_id?: number | null
          id?: string
          language_code?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_translations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_media: {
        Row: {
          exercise_id: string
          id: string
          media_type: string
          sort_order: number
          url: string
        }
        Insert: {
          exercise_id: string
          id?: string
          media_type: string
          sort_order?: number
          url: string
        }
        Update: {
          exercise_id?: string
          id?: string
          media_type?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_media_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_translations: {
        Row: {
          description: string | null
          exercise_id: string
          id: string
          language_code: string
          name: string
        }
        Insert: {
          description?: string | null
          exercise_id: string
          id?: string
          language_code: string
          name: string
        }
        Update: {
          description?: string | null
          exercise_id?: string
          id?: string
          language_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_translations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_types: {
        Row: {
          code: string
          id: number
        }
        Insert: {
          code: string
          id?: number
        }
        Update: {
          code?: string
          id?: number
        }
        Relationships: []
      }
      exercises: {
        Row: {
          base_name_en: string | null
          base_name_es: string
          created_at: string
          description_en: string | null
          description_es: string | null
          difficulty: string | null
          equipment_id: number | null
          exercise_type_id: number | null
          id: string
          is_custom: boolean
          load_type: Database["public"]["Enums"]["exercise_load_type"] | null
          owner_user_id: string | null
          primary_muscle_id: number | null
          secondary_muscle_id: number | null
        }
        Insert: {
          base_name_en?: string | null
          base_name_es: string
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          difficulty?: string | null
          equipment_id?: number | null
          exercise_type_id?: number | null
          id?: string
          is_custom?: boolean
          load_type?: Database["public"]["Enums"]["exercise_load_type"] | null
          owner_user_id?: string | null
          primary_muscle_id?: number | null
          secondary_muscle_id?: number | null
        }
        Update: {
          base_name_en?: string | null
          base_name_es?: string
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          difficulty?: string | null
          equipment_id?: number | null
          exercise_type_id?: number | null
          id?: string
          is_custom?: boolean
          load_type?: Database["public"]["Enums"]["exercise_load_type"] | null
          owner_user_id?: string | null
          primary_muscle_id?: number | null
          secondary_muscle_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_exercise_type_id_fkey"
            columns: ["exercise_type_id"]
            isOneToOne: false
            referencedRelation: "exercise_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_primary_muscle_id_fkey"
            columns: ["primary_muscle_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_secondary_muscle_id_fkey"
            columns: ["secondary_muscle_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      external_accounts: {
        Row: {
          access_token: string | null
          created_at: string
          external_user_id: string
          id: string
          provider: string
          refresh_token: string | null
          scopes: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          external_user_id: string
          id?: string
          provider: string
          refresh_token?: string | null
          scopes?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          external_user_id?: string
          id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_activity_mappings: {
        Row: {
          activity_session_id: string
          external_account_id: string
          external_activity_id: string
          id: string
          imported_at: string
          provider: string
          user_id: string
        }
        Insert: {
          activity_session_id: string
          external_account_id: string
          external_activity_id: string
          id?: string
          imported_at?: string
          provider: string
          user_id: string
        }
        Update: {
          activity_session_id?: string
          external_account_id?: string
          external_activity_id?: string
          id?: string
          imported_at?: string
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_activity_mappings_activity_session_id_fkey"
            columns: ["activity_session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activity_mappings_external_account_id_fkey"
            columns: ["external_account_id"]
            isOneToOne: false
            referencedRelation: "external_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activity_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_raw_payloads: {
        Row: {
          external_activity_mapping_id: string
          id: string
          payload: Json
          received_at: string
        }
        Insert: {
          external_activity_mapping_id: string
          id?: string
          payload: Json
          received_at?: string
        }
        Update: {
          external_activity_mapping_id?: string
          id?: string
          payload?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_raw_payloads_external_activity_mapping_id_fkey"
            columns: ["external_activity_mapping_id"]
            isOneToOne: false
            referencedRelation: "external_activity_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      external_raw_payloads_v2: {
        Row: {
          created_at: string
          id: string
          object_type: string
          payload: Json | null
          payload_hash: string
          processed_at: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          received_at: string
          related_id: string | null
          related_table: string | null
          size_bytes: number | null
          source_channel: string
          source_package: string | null
          source_record_id: string | null
          storage_bucket: string | null
          storage_path: string | null
          trace_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          object_type: string
          payload?: Json | null
          payload_hash: string
          processed_at?: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          received_at?: string
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          source_channel: string
          source_package?: string | null
          source_record_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          trace_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          object_type?: string
          payload?: Json | null
          payload_hash?: string
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          received_at?: string
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          source_channel?: string
          source_package?: string | null
          source_record_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          trace_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_raw_payloads_v2_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      health_connect_provider_selection: {
        Row: {
          origin_id: string
          selected_at: string
          selected_package_name: string
          selected_provider_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          origin_id: string
          selected_at?: string
          selected_package_name: string
          selected_provider_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          origin_id?: string
          selected_at?: string
          selected_package_name?: string
          selected_provider_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_connect_provider_selection_origin_user_fkey"
            columns: ["origin_id", "user_id"]
            isOneToOne: false
            referencedRelation: "provider_data_origins"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "health_connect_provider_selection_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      health_metric_samples: {
        Row: {
          activity_session_id: string | null
          created_at: string
          id: string
          local_date: string | null
          metric_type: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload: Json | null
          raw_payload_id: string | null
          recorded_at: string
          sleep_session_id: string | null
          source_channel: string
          source_package: string | null
          source_record_id: string | null
          timezone: string | null
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          activity_session_id?: string | null
          created_at?: string
          id?: string
          local_date?: string | null
          metric_type: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload?: Json | null
          raw_payload_id?: string | null
          recorded_at: string
          sleep_session_id?: string | null
          source_channel: string
          source_package?: string | null
          source_record_id?: string | null
          timezone?: string | null
          unit: string
          user_id: string
          value: number
        }
        Update: {
          activity_session_id?: string | null
          created_at?: string
          id?: string
          local_date?: string | null
          metric_type?: string
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload?: Json | null
          raw_payload_id?: string | null
          recorded_at?: string
          sleep_session_id?: string | null
          source_channel?: string
          source_package?: string | null
          source_record_id?: string | null
          timezone?: string | null
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_metric_samples_activity_session_id_fkey"
            columns: ["activity_session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_metric_samples_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_metric_samples_sleep_session_id_fkey"
            columns: ["sleep_session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_metric_samples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_import_batches: {
        Row: {
          batch_number: number | null
          created_at: string
          id: string
          inserted_count: number
          payload: Json
          updated_count: number
        }
        Insert: {
          batch_number?: number | null
          created_at?: string
          id?: string
          inserted_count?: number
          payload: Json
          updated_count?: number
        }
        Update: {
          batch_number?: number | null
          created_at?: string
          id?: string
          inserted_count?: number
          payload?: Json
          updated_count?: number
        }
        Relationships: []
      }
      ingredient_usda_cache: {
        Row: {
          chosen_data_type: string
          chosen_description: string
          chosen_fdc_id: number
          confidence_score: number
          created_at: string
          id: string
          resolved_en_query: string
          resolver_version: string
          spanish_input_norm: string
          spanish_input_raw: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chosen_data_type: string
          chosen_description: string
          chosen_fdc_id: number
          confidence_score: number
          created_at?: string
          id?: string
          resolved_en_query: string
          resolver_version?: string
          spanish_input_norm: string
          spanish_input_raw: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chosen_data_type?: string
          chosen_description?: string
          chosen_fdc_id?: number
          confidence_score?: number
          created_at?: string
          id?: string
          resolved_en_query?: string
          resolver_version?: string
          spanish_input_norm?: string
          spanish_input_raw?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_usda_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          carbs_g_100: number | null
          category: Database["public"]["Enums"]["ingredients_category"]
          created_at: string
          fat_g_100: number | null
          fiber_g_100: number | null
          id: string
          kcal_100: number | null
          name_en: string
          name_es: string
          name_norm_es: string
          notes_en: string | null
          notes_es: string | null
          protein_g_100: number | null
          quality_score: number
          salt_g_100: number | null
          sodium_mg_100: number | null
          source_primary: Json | null
          source_secondary: Json | null
          sugar_g_100: number | null
          unit_basis: Database["public"]["Enums"]["ingredients_unit_basis"]
          updated_at: string
        }
        Insert: {
          carbs_g_100?: number | null
          category: Database["public"]["Enums"]["ingredients_category"]
          created_at?: string
          fat_g_100?: number | null
          fiber_g_100?: number | null
          id?: string
          kcal_100?: number | null
          name_en: string
          name_es: string
          name_norm_es: string
          notes_en?: string | null
          notes_es?: string | null
          protein_g_100?: number | null
          quality_score: number
          salt_g_100?: number | null
          sodium_mg_100?: number | null
          source_primary?: Json | null
          source_secondary?: Json | null
          sugar_g_100?: number | null
          unit_basis?: Database["public"]["Enums"]["ingredients_unit_basis"]
          updated_at?: string
        }
        Update: {
          carbs_g_100?: number | null
          category?: Database["public"]["Enums"]["ingredients_category"]
          created_at?: string
          fat_g_100?: number | null
          fiber_g_100?: number | null
          id?: string
          kcal_100?: number | null
          name_en?: string
          name_es?: string
          name_norm_es?: string
          notes_en?: string | null
          notes_es?: string | null
          protein_g_100?: number | null
          quality_score?: number
          salt_g_100?: number | null
          sodium_mg_100?: number | null
          source_primary?: Json | null
          source_secondary?: Json | null
          sugar_g_100?: number | null
          unit_basis?: Database["public"]["Enums"]["ingredients_unit_basis"]
          updated_at?: string
        }
        Relationships: []
      }
      integration_sync_state: {
        Row: {
          anchor_token: string | null
          created_at: string
          cursor_token: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_record_at: string | null
          last_success_at: string | null
          metadata: Json | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string
          source_package: string | null
          status: string
          sync_domain: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_token?: string | null
          created_at?: string
          cursor_token?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_record_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string
          source_package?: string | null
          status?: string
          sync_domain: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_token?: string | null
          created_at?: string
          cursor_token?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_record_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string
          source_package?: string | null
          status?: string
          sync_domain?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          carbs_g: number | null
          confidence: number | null
          created_at: string
          data_quality: Database["public"]["Enums"]["meal_items_data_quality"]
          fats_g: number | null
          id: string
          kcal: number | null
          meal_log_id: string
          name: string
          origin: Database["public"]["Enums"]["meal_items_origin"]
          per_100g_carbs_g: number | null
          per_100g_fats_g: number | null
          per_100g_kcal: number | null
          per_100g_protein_g: number | null
          protein_g: number | null
          quantity_g: number
          source: Database["public"]["Enums"]["meal_items_source"]
          source_ref: string | null
          user_id: string
        }
        Insert: {
          carbs_g?: number | null
          confidence?: number | null
          created_at?: string
          data_quality?: Database["public"]["Enums"]["meal_items_data_quality"]
          fats_g?: number | null
          id?: string
          kcal?: number | null
          meal_log_id: string
          name: string
          origin?: Database["public"]["Enums"]["meal_items_origin"]
          per_100g_carbs_g?: number | null
          per_100g_fats_g?: number | null
          per_100g_kcal?: number | null
          per_100g_protein_g?: number | null
          protein_g?: number | null
          quantity_g: number
          source?: Database["public"]["Enums"]["meal_items_source"]
          source_ref?: string | null
          user_id: string
        }
        Update: {
          carbs_g?: number | null
          confidence?: number | null
          created_at?: string
          data_quality?: Database["public"]["Enums"]["meal_items_data_quality"]
          fats_g?: number | null
          id?: string
          kcal?: number | null
          meal_log_id?: string
          name?: string
          origin?: Database["public"]["Enums"]["meal_items_origin"]
          per_100g_carbs_g?: number | null
          per_100g_fats_g?: number | null
          per_100g_kcal?: number | null
          per_100g_protein_g?: number | null
          protein_g?: number | null
          quantity_g?: number
          source?: Database["public"]["Enums"]["meal_items_source"]
          source_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_log_fkey"
            columns: ["meal_log_id"]
            isOneToOne: false
            referencedRelation: "meal_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_log_user_fkey"
            columns: ["meal_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "meal_logs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "meal_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          adherence_status: string | null
          calc_version: string
          carbs_g: number | null
          data_quality: Database["public"]["Enums"]["meal_logs_data_quality"]
          date: string
          diet_template_meal_id: string | null
          fats_g: number | null
          id: string
          kcal: number | null
          logged_at: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          name: string | null
          notes: string | null
          origin: Database["public"]["Enums"]["meal_logs_origin"]
          origin_confidence: number | null
          protein_g: number | null
          source: string
          user_id: string
        }
        Insert: {
          adherence_status?: string | null
          calc_version?: string
          carbs_g?: number | null
          data_quality?: Database["public"]["Enums"]["meal_logs_data_quality"]
          date: string
          diet_template_meal_id?: string | null
          fats_g?: number | null
          id?: string
          kcal?: number | null
          logged_at?: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          name?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["meal_logs_origin"]
          origin_confidence?: number | null
          protein_g?: number | null
          source?: string
          user_id: string
        }
        Update: {
          adherence_status?: string | null
          calc_version?: string
          carbs_g?: number | null
          data_quality?: Database["public"]["Enums"]["meal_logs_data_quality"]
          date?: string
          diet_template_meal_id?: string | null
          fats_g?: number | null
          id?: string
          kcal?: number | null
          logged_at?: string
          meal_type?: Database["public"]["Enums"]["meal_type_enum"]
          name?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["meal_logs_origin"]
          origin_confidence?: number | null
          protein_g?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_diet_template_meal_id_fkey"
            columns: ["diet_template_meal_id"]
            isOneToOne: false
            referencedRelation: "diet_template_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      muscle_group_translations: {
        Row: {
          id: string
          language_code: string | null
          muscle_group_id: number | null
          name: string
        }
        Insert: {
          id?: string
          language_code?: string | null
          muscle_group_id?: number | null
          name: string
        }
        Update: {
          id?: string
          language_code?: string | null
          muscle_group_id?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "muscle_group_translations_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      muscle_groups: {
        Row: {
          code: string
          id: number
        }
        Insert: {
          code: string
          id?: number
        }
        Update: {
          code?: string
          id?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json
          id: string
          read_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_connection_tokens: {
        Row: {
          access_token: string
          connection_id: string
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          refresh_token: string | null
          scope: string | null
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connection_id: string
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connection_id?: string
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_connection_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "user_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_connection_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_data_origins: {
        Row: {
          created_at: string
          device_id: string | null
          display_name: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          platform: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload: Json | null
          source_channel: string
          source_package: string | null
          source_provider_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          display_name?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload?: Json | null
          source_channel: string
          source_package?: string | null
          source_provider_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          display_name?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload?: Json | null
          source_channel?: string
          source_package?: string | null
          source_provider_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_data_origins_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_data_origins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          expires_at: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          redirect_uri: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          expires_at: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          redirect_uri?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          redirect_uri?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_aliases: {
        Row: {
          alias_es: string
          alias_norm_es: string
          created_at: string
          id: string
          recipe_id: string
        }
        Insert: {
          alias_es: string
          alias_norm_es: string
          created_at?: string
          id?: string
          recipe_id: string
        }
        Update: {
          alias_es?: string
          alias_norm_es?: string
          created_at?: string
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_aliases_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_favorites: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          notes: string | null
          order_index: number
          quantity: number
          recipe_id: string
          unit: Database["public"]["Enums"]["recipe_items_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          notes?: string | null
          order_index?: number
          quantity: number
          recipe_id: string
          unit: Database["public"]["Enums"]["recipe_items_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          notes?: string | null
          order_index?: number
          quantity?: number
          recipe_id?: string
          unit?: Database["public"]["Enums"]["recipe_items_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_usage_events: {
        Row: {
          context: Database["public"]["Enums"]["recipe_usage_context_enum"]
          event_bucket_10m: string
          id: string
          is_public_eligible: boolean
          recipe_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          context: Database["public"]["Enums"]["recipe_usage_context_enum"]
          event_bucket_10m: string
          id?: string
          is_public_eligible?: boolean
          recipe_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          context?: Database["public"]["Enums"]["recipe_usage_context_enum"]
          event_bucket_10m?: string
          id?: string
          is_public_eligible?: boolean
          recipe_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_usage_events_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          carbs_g_100: number
          created_at: string
          deleted_at: string | null
          description_en: string | null
          description_es: string | null
          fat_g_100: number
          favorites_total: number
          id: string
          kcal_100: number
          name_en: string | null
          name_es: string
          name_norm_es: string
          origin_recipe_id: string | null
          owner_user_id: string | null
          popularity_score: number
          protein_g_100: number
          public_slug: string | null
          published_at: string | null
          quality_score: number
          saves_total: number
          source: Database["public"]["Enums"]["recipe_source_enum"]
          updated_at: string
          users_unique_30d: number
          uses_30d: number
          uses_7d: number
          uses_total: number
          visibility: Database["public"]["Enums"]["recipe_visibility_enum"]
        }
        Insert: {
          carbs_g_100?: number
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_es?: string | null
          fat_g_100?: number
          favorites_total?: number
          id?: string
          kcal_100?: number
          name_en?: string | null
          name_es: string
          name_norm_es: string
          origin_recipe_id?: string | null
          owner_user_id?: string | null
          popularity_score?: number
          protein_g_100?: number
          public_slug?: string | null
          published_at?: string | null
          quality_score?: number
          saves_total?: number
          source?: Database["public"]["Enums"]["recipe_source_enum"]
          updated_at?: string
          users_unique_30d?: number
          uses_30d?: number
          uses_7d?: number
          uses_total?: number
          visibility?: Database["public"]["Enums"]["recipe_visibility_enum"]
        }
        Update: {
          carbs_g_100?: number
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_es?: string | null
          fat_g_100?: number
          favorites_total?: number
          id?: string
          kcal_100?: number
          name_en?: string | null
          name_es?: string
          name_norm_es?: string
          origin_recipe_id?: string | null
          owner_user_id?: string | null
          popularity_score?: number
          protein_g_100?: number
          public_slug?: string | null
          published_at?: string | null
          quality_score?: number
          saves_total?: number
          source?: Database["public"]["Enums"]["recipe_source_enum"]
          updated_at?: string
          users_unique_30d?: number
          uses_30d?: number
          uses_7d?: number
          uses_total?: number
          visibility?: Database["public"]["Enums"]["recipe_visibility_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "recipes_origin_recipe_id_fkey"
            columns: ["origin_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      resting_hr_logs: {
        Row: {
          id: string
          measured_at: string
          raw_payload_id: string | null
          resting_hr_bpm: number
          source: string
          source_channel: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          source_updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          measured_at?: string
          raw_payload_id?: string | null
          resting_hr_bpm: number
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          measured_at?: string
          raw_payload_id?: string | null
          resting_hr_bpm?: number
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resting_hr_logs_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resting_hr_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_feedback: {
        Row: {
          created_at: string
          id: string
          mood: number | null
          notes: string | null
          rpe: number | null
          session_id: string
          sleep_quality: number | null
          soreness: number | null
          stress: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mood?: number | null
          notes?: string | null
          rpe?: number | null
          session_id: string
          sleep_quality?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mood?: number | null
          notes?: string | null
          rpe?: number | null
          session_id?: string
          sleep_quality?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_biomarker_samples: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          metric_type: Database["public"]["Enums"]["biomarker_type_enum"]
          raw_payload: Json | null
          raw_payload_id: string | null
          sleep_session_id: string
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          timestamp: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          metric_type: Database["public"]["Enums"]["biomarker_type_enum"]
          raw_payload?: Json | null
          raw_payload_id?: string | null
          sleep_session_id: string
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          timestamp: string
          unit: string
          user_id: string
          value: number
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          metric_type?: Database["public"]["Enums"]["biomarker_type_enum"]
          raw_payload?: Json | null
          raw_payload_id?: string | null
          sleep_session_id?: string
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          timestamp?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sleep_biomarker_samples_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_biomarker_samples_sleep_session_id_fkey"
            columns: ["sleep_session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_biomarker_samples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_logs: {
        Row: {
          date: string
          duration_min: number | null
          id: string
          quality_score: number | null
          sleep_end: string | null
          sleep_start: string | null
          source: string
          user_id: string
        }
        Insert: {
          date: string
          duration_min?: number | null
          id?: string
          quality_score?: number | null
          sleep_end?: string | null
          sleep_start?: string | null
          source?: string
          user_id: string
        }
        Update: {
          date?: string
          duration_min?: number | null
          id?: string
          quality_score?: number | null
          sleep_end?: string | null
          sleep_start?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_sessions: {
        Row: {
          after_wakeup_min: number | null
          avg_heart_rate_bpm: number | null
          avg_hrv_ms: number | null
          avg_respiratory_rpm: number | null
          avg_skin_temp_c: number | null
          avg_spo2_pct: number | null
          awake_in_bed_min: number | null
          awake_min: number | null
          bedtime_end: string | null
          bedtime_start: string | null
          confidence: number | null
          core_sleep_min: number | null
          created_at: string
          data_quality:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          deep_sleep_min: number | null
          device_id: string | null
          duration_in_bed_min: number | null
          end_time: string
          hrv_rmssd_ms: number | null
          id: string
          is_main_sleep: boolean
          is_manual: boolean
          is_nap: boolean
          light_sleep_min: number | null
          max_heart_rate_bpm: number | null
          max_respiratory_rpm: number | null
          min_heart_rate_bpm: number | null
          min_respiratory_rpm: number | null
          min_spo2_pct: number | null
          nap_type: string | null
          number_of_awakenings: number | null
          out_of_bed_min: number | null
          raw_payload: Json | null
          raw_payload_id: string | null
          rem_sleep_min: number | null
          resting_hr_bpm: number | null
          restless_min: number | null
          restless_periods: number | null
          skin_temp_deviation_c: number | null
          sleep_efficiency_pct: number | null
          sleep_end: string | null
          sleep_latency_min: number | null
          sleep_quality_label: string | null
          sleep_score: number | null
          sleep_start: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_created_at: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          source_sleep_id: string | null
          source_updated_at: string | null
          start_time: string
          synced_at: string
          timezone: string
          total_sleep_min: number | null
          unknown_sleep_min: number | null
          updated_at: string
          user_id: string
          waso_min: number | null
        }
        Insert: {
          after_wakeup_min?: number | null
          avg_heart_rate_bpm?: number | null
          avg_hrv_ms?: number | null
          avg_respiratory_rpm?: number | null
          avg_skin_temp_c?: number | null
          avg_spo2_pct?: number | null
          awake_in_bed_min?: number | null
          awake_min?: number | null
          bedtime_end?: string | null
          bedtime_start?: string | null
          confidence?: number | null
          core_sleep_min?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date: string
          deep_sleep_min?: number | null
          device_id?: string | null
          duration_in_bed_min?: number | null
          end_time: string
          hrv_rmssd_ms?: number | null
          id?: string
          is_main_sleep?: boolean
          is_manual?: boolean
          is_nap?: boolean
          light_sleep_min?: number | null
          max_heart_rate_bpm?: number | null
          max_respiratory_rpm?: number | null
          min_heart_rate_bpm?: number | null
          min_respiratory_rpm?: number | null
          min_spo2_pct?: number | null
          nap_type?: string | null
          number_of_awakenings?: number | null
          out_of_bed_min?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          rem_sleep_min?: number | null
          resting_hr_bpm?: number | null
          restless_min?: number | null
          restless_periods?: number | null
          skin_temp_deviation_c?: number | null
          sleep_efficiency_pct?: number | null
          sleep_end?: string | null
          sleep_latency_min?: number | null
          sleep_quality_label?: string | null
          sleep_score?: number | null
          sleep_start?: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_created_at?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_sleep_id?: string | null
          source_updated_at?: string | null
          start_time: string
          synced_at?: string
          timezone: string
          total_sleep_min?: number | null
          unknown_sleep_min?: number | null
          updated_at?: string
          user_id: string
          waso_min?: number | null
        }
        Update: {
          after_wakeup_min?: number | null
          avg_heart_rate_bpm?: number | null
          avg_hrv_ms?: number | null
          avg_respiratory_rpm?: number | null
          avg_skin_temp_c?: number | null
          avg_spo2_pct?: number | null
          awake_in_bed_min?: number | null
          awake_min?: number | null
          bedtime_end?: string | null
          bedtime_start?: string | null
          confidence?: number | null
          core_sleep_min?: number | null
          created_at?: string
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          date?: string
          deep_sleep_min?: number | null
          device_id?: string | null
          duration_in_bed_min?: number | null
          end_time?: string
          hrv_rmssd_ms?: number | null
          id?: string
          is_main_sleep?: boolean
          is_manual?: boolean
          is_nap?: boolean
          light_sleep_min?: number | null
          max_heart_rate_bpm?: number | null
          max_respiratory_rpm?: number | null
          min_heart_rate_bpm?: number | null
          min_respiratory_rpm?: number | null
          min_spo2_pct?: number | null
          nap_type?: string | null
          number_of_awakenings?: number | null
          out_of_bed_min?: number | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          rem_sleep_min?: number | null
          resting_hr_bpm?: number | null
          restless_min?: number | null
          restless_periods?: number | null
          skin_temp_deviation_c?: number | null
          sleep_efficiency_pct?: number | null
          sleep_end?: string | null
          sleep_latency_min?: number | null
          sleep_quality_label?: string | null
          sleep_score?: number | null
          sleep_start?: string | null
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_created_at?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_sleep_id?: string | null
          source_updated_at?: string | null
          start_time?: string
          synced_at?: string
          timezone?: string
          total_sleep_min?: number | null
          unknown_sleep_min?: number | null
          updated_at?: string
          user_id?: string
          waso_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_sessions_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_stage_intervals: {
        Row: {
          confidence: number | null
          created_at: string
          duration_min: number
          end_time: string
          id: string
          provider_stage: string | null
          raw_payload: Json | null
          raw_payload_id: string | null
          sleep_session_id: string
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          stage: Database["public"]["Enums"]["sleep_stage_enum"]
          start_time: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          duration_min: number
          end_time: string
          id?: string
          provider_stage?: string | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          sleep_session_id: string
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stage: Database["public"]["Enums"]["sleep_stage_enum"]
          start_time: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          duration_min?: number
          end_time?: string
          id?: string
          provider_stage?: string | null
          raw_payload?: Json | null
          raw_payload_id?: string | null
          sleep_session_id?: string
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          stage?: Database["public"]["Enums"]["sleep_stage_enum"]
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_stage_intervals_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_stage_intervals_sleep_session_id_fkey"
            columns: ["sleep_session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_stage_intervals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_follows: {
        Row: {
          created_at: string
          id: string
          id_followed: string
          id_follower: string
          is_accepted: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          id_followed: string
          id_follower: string
          is_accepted?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          id_followed?: string
          id_follower?: string
          is_accepted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "social_follows_id_followed_fkey"
            columns: ["id_followed"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_follows_id_follower_fkey"
            columns: ["id_follower"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_catalog_options: {
        Row: {
          created_at: string
          group_translation_key: string
          id: string
          is_active: boolean
          is_template_selectable: boolean
          option_key: string
          option_type: string
          sort_order: number
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          translation_key: string
        }
        Insert: {
          created_at?: string
          group_translation_key: string
          id?: string
          is_active?: boolean
          is_template_selectable?: boolean
          option_key: string
          option_type: string
          sort_order?: number
          sport_type: Database["public"]["Enums"]["sport_type_enum"]
          translation_key: string
        }
        Update: {
          created_at?: string
          group_translation_key?: string
          id?: string
          is_active?: boolean
          is_template_selectable?: boolean
          option_key?: string
          option_type?: string
          sort_order?: number
          sport_type?: Database["public"]["Enums"]["sport_type_enum"]
          translation_key?: string
        }
        Relationships: []
      }
      step_intervals: {
        Row: {
          activity_type: string | null
          cadence_spm: number | null
          calories_kcal: number | null
          context: string | null
          created_at: string
          daily_steps_id: string | null
          data_quality:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          device_id: string | null
          distance_m: number | null
          end_time: string
          id: string
          raw_payload: Json | null
          raw_payload_id: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          speed_mps: number | null
          start_time: string
          steps: number
          synced_at: string
          timezone: string
          user_id: string
        }
        Insert: {
          activity_type?: string | null
          cadence_spm?: number | null
          calories_kcal?: number | null
          context?: string | null
          created_at?: string
          daily_steps_id?: string | null
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          device_id?: string | null
          distance_m?: number | null
          end_time: string
          id?: string
          raw_payload?: Json | null
          raw_payload_id?: string | null
          source: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          speed_mps?: number | null
          start_time: string
          steps: number
          synced_at?: string
          timezone: string
          user_id: string
        }
        Update: {
          activity_type?: string | null
          cadence_spm?: number | null
          calories_kcal?: number | null
          context?: string | null
          created_at?: string
          daily_steps_id?: string | null
          data_quality?:
            | Database["public"]["Enums"]["health_data_quality_enum"]
            | null
          device_id?: string | null
          distance_m?: number | null
          end_time?: string
          id?: string
          raw_payload?: Json | null
          raw_payload_id?: string | null
          source?: Database["public"]["Enums"]["wearable_provider_enum"]
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          speed_mps?: number | null
          start_time?: string
          steps?: number
          synced_at?: string
          timezone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_intervals_daily_steps_id_fkey"
            columns: ["daily_steps_id"]
            isOneToOne: false
            referencedRelation: "daily_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_intervals_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_intervals_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_intervals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          name_norm: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          name_norm: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          name_norm?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_connections: {
        Row: {
          access_token: string | null
          connection_kind: string
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          provider_user_id: string | null
          provider_username: string | null
          refresh_token: string | null
          revoked_at: string | null
          scope: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connection_kind?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          provider_user_id?: string | null
          provider_username?: string | null
          refresh_token?: string | null
          revoked_at?: string | null
          scope?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          connection_kind?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          provider_user_id?: string | null
          provider_username?: string | null
          refresh_token?: string | null
          revoked_at?: string | null
          scope?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          created_at: string
          description: string | null
          goal_type: string
          id: string
          is_active: boolean
          sport_type: string | null
          target_bodyfat_percent: number | null
          target_calories_kcal: number | null
          target_carbs_g: number | null
          target_distance_m: number | null
          target_fats_g: number | null
          target_power_w: number | null
          target_protein_g: number | null
          target_time_s: number | null
          target_weight_kg: number | null
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          goal_type: string
          id?: string
          is_active?: boolean
          sport_type?: string | null
          target_bodyfat_percent?: number | null
          target_calories_kcal?: number | null
          target_carbs_g?: number | null
          target_distance_m?: number | null
          target_fats_g?: number | null
          target_power_w?: number | null
          target_protein_g?: number | null
          target_time_s?: number | null
          target_weight_kg?: number | null
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          goal_type?: string
          id?: string
          is_active?: boolean
          sport_type?: string | null
          target_bodyfat_percent?: number | null
          target_calories_kcal?: number | null
          target_carbs_g?: number | null
          target_distance_m?: number | null
          target_fats_g?: number | null
          target_power_w?: number | null
          target_protein_g?: number | null
          target_time_s?: number | null
          target_weight_kg?: number | null
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_nutrition_settings: {
        Row: {
          activity_level: Database["public"]["Enums"]["user_nutrition_settings_activity_level"]
          adjustment_type: Database["public"]["Enums"]["user_nutrition_settings_adjustment_type"]
          adjustment_value: number
          created_at: string
          daily_activity:
            | Database["public"]["Enums"]["daily_activity_enum"]
            | null
          fat_g_per_kg: number | null
          goal_mode: Database["public"]["Enums"]["user_nutrition_settings_goal_mode"]
          primary_goal: Database["public"]["Enums"]["user_nutrition_settings_primary_goal_mode"]
          protein_g_per_kg: number | null
          training_frequency:
            | Database["public"]["Enums"]["training_frequency_enum"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_level: Database["public"]["Enums"]["user_nutrition_settings_activity_level"]
          adjustment_type: Database["public"]["Enums"]["user_nutrition_settings_adjustment_type"]
          adjustment_value?: number
          created_at?: string
          daily_activity?:
            | Database["public"]["Enums"]["daily_activity_enum"]
            | null
          fat_g_per_kg?: number | null
          goal_mode: Database["public"]["Enums"]["user_nutrition_settings_goal_mode"]
          primary_goal: Database["public"]["Enums"]["user_nutrition_settings_primary_goal_mode"]
          protein_g_per_kg?: number | null
          training_frequency?:
            | Database["public"]["Enums"]["training_frequency_enum"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_level?: Database["public"]["Enums"]["user_nutrition_settings_activity_level"]
          adjustment_type?: Database["public"]["Enums"]["user_nutrition_settings_adjustment_type"]
          adjustment_value?: number
          created_at?: string
          daily_activity?:
            | Database["public"]["Enums"]["daily_activity_enum"]
            | null
          fat_g_per_kg?: number | null
          goal_mode?: Database["public"]["Enums"]["user_nutrition_settings_goal_mode"]
          primary_goal?: Database["public"]["Enums"]["user_nutrition_settings_primary_goal_mode"]
          protein_g_per_kg?: number | null
          training_frequency?:
            | Database["public"]["Enums"]["training_frequency_enum"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_nutrition_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          appearance_settings: Json | null
          distance_unit: Database["public"]["Enums"]["user_preferences_distance_unit"]
          energy_unit: Database["public"]["Enums"]["user_preferences_energy_unit"]
          health_data_consent: boolean
          health_data_consent_at: string | null
          health_data_consent_version: string | null
          import_health_metrics: boolean
          language_code: Database["public"]["Enums"]["user_preferences_language_code"]
          notification_settings: Json | null
          nutrition_prefs: Json | null
          pace_unit: Database["public"]["Enums"]["user_preferences_pace_unit"]
          privacy_settings: Json | null
          temperature_unit: string
          timezone: string | null
          user_id: string
          weight_unit: Database["public"]["Enums"]["user_preferences_weight_unit"]
        }
        Insert: {
          appearance_settings?: Json | null
          distance_unit?: Database["public"]["Enums"]["user_preferences_distance_unit"]
          energy_unit?: Database["public"]["Enums"]["user_preferences_energy_unit"]
          health_data_consent?: boolean
          health_data_consent_at?: string | null
          health_data_consent_version?: string | null
          import_health_metrics?: boolean
          language_code?: Database["public"]["Enums"]["user_preferences_language_code"]
          notification_settings?: Json | null
          nutrition_prefs?: Json | null
          pace_unit?: Database["public"]["Enums"]["user_preferences_pace_unit"]
          privacy_settings?: Json | null
          temperature_unit?: string
          timezone?: string | null
          user_id: string
          weight_unit?: Database["public"]["Enums"]["user_preferences_weight_unit"]
        }
        Update: {
          appearance_settings?: Json | null
          distance_unit?: Database["public"]["Enums"]["user_preferences_distance_unit"]
          energy_unit?: Database["public"]["Enums"]["user_preferences_energy_unit"]
          health_data_consent?: boolean
          health_data_consent_at?: string | null
          health_data_consent_version?: string | null
          import_health_metrics?: boolean
          language_code?: Database["public"]["Enums"]["user_preferences_language_code"]
          notification_settings?: Json | null
          nutrition_prefs?: Json | null
          pace_unit?: Database["public"]["Enums"]["user_preferences_pace_unit"]
          privacy_settings?: Json | null
          temperature_unit?: string
          timezone?: string | null
          user_id?: string
          weight_unit?: Database["public"]["Enums"]["user_preferences_weight_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string
          height_cm: number | null
          id: string
          onboarding_step: number | null
          sex: Database["public"]["Enums"]["users_sex"] | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email: string
          height_cm?: number | null
          id: string
          onboarding_step?: number | null
          sex?: Database["public"]["Enums"]["users_sex"] | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string
          height_cm?: number | null
          id?: string
          onboarding_step?: number | null
          sex?: Database["public"]["Enums"]["users_sex"] | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      vo2_max_logs: {
        Row: {
          activity_session_id: string | null
          created_at: string
          id: string
          measured_at: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id: string | null
          source_channel: string | null
          source_package: string | null
          source_record_id: string | null
          user_id: string
          value_ml_kg_min: number
        }
        Insert: {
          activity_session_id?: string | null
          created_at?: string
          id?: string
          measured_at: string
          provider: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          user_id: string
          value_ml_kg_min: number
        }
        Update: {
          activity_session_id?: string | null
          created_at?: string
          id?: string
          measured_at?: string
          provider?: Database["public"]["Enums"]["wearable_provider_enum"]
          raw_payload_id?: string | null
          source_channel?: string | null
          source_package?: string | null
          source_record_id?: string | null
          user_id?: string
          value_ml_kg_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "vo2_max_logs_activity_session_id_fkey"
            columns: ["activity_session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo2_max_logs_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo2_max_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          bodyfat_percent: number | null
          id: string
          measured_at: string
          muscle_mass_kg: number | null
          raw_payload_id: string | null
          source: string
          source_channel: string | null
          source_package: string | null
          source_provider_key: string | null
          source_record_id: string | null
          source_updated_at: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          bodyfat_percent?: number | null
          id?: string
          measured_at?: string
          muscle_mass_kg?: number | null
          raw_payload_id?: string | null
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          bodyfat_percent?: number | null
          id?: string
          measured_at?: string
          muscle_mass_kg?: number | null
          raw_payload_id?: string | null
          source?: string
          source_channel?: string | null
          source_package?: string | null
          source_provider_key?: string | null
          source_record_id?: string | null
          source_updated_at?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "external_raw_payloads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          activity_session_id: string | null
          completed_at: string | null
          created_at: string
          endurance_template_id: string | null
          gym_template_id: string | null
          id: string
          notes: string | null
          planned_date: string
          status: Database["public"]["Enums"]["workout_plans_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          endurance_template_id?: string | null
          gym_template_id?: string | null
          id?: string
          notes?: string | null
          planned_date: string
          status?: Database["public"]["Enums"]["workout_plans_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          endurance_template_id?: string | null
          gym_template_id?: string | null
          id?: string
          notes?: string | null
          planned_date?: string
          status?: Database["public"]["Enums"]["workout_plans_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_activity_session_id_fkey"
            columns: ["activity_session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_endurance_template_id_fkey"
            columns: ["endurance_template_id"]
            isOneToOne: false
            referencedRelation: "endurance_workout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_gym_template_id_fkey"
            columns: ["gym_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          avg_hr_bpm: number | null
          calories_kcal: number | null
          created_at: string
          distance_m: number | null
          duration_s: number | null
          exercise_id: string
          id: string
          is_pr: boolean
          is_warmup: boolean
          max_hr_bpm: number | null
          notes: string | null
          pause_s: number | null
          reps: number
          rest_s: number | null
          rpe: number | null
          session_id: string
          set_number: number
          set_type: string
          tempo: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          avg_hr_bpm?: number | null
          calories_kcal?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          exercise_id: string
          id?: string
          is_pr?: boolean
          is_warmup?: boolean
          max_hr_bpm?: number | null
          notes?: string | null
          pause_s?: number | null
          reps: number
          rest_s?: number | null
          rpe?: number | null
          session_id: string
          set_number: number
          set_type?: string
          tempo?: string | null
          user_id: string
          weight_kg?: number
        }
        Update: {
          avg_hr_bpm?: number | null
          calories_kcal?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          exercise_id?: string
          id?: string
          is_pr?: boolean
          is_warmup?: boolean
          max_hr_bpm?: number | null
          notes?: string | null
          pause_s?: number | null
          reps?: number
          rest_s?: number | null
          rpe?: number | null
          session_id?: string
          set_number?: number
          set_type?: string
          tempo?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_template_exercises: {
        Row: {
          exercise_id: string
          id: string
          is_warmup: boolean
          notes: string | null
          order_index: number
          rest_seconds: number | null
          superset_next_exercise_id: string | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rpe: number | null
          target_sets: number | null
          target_weight_kg: number | null
          user_id: string | null
          workout_template_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          is_warmup?: boolean
          notes?: string | null
          order_index: number
          rest_seconds?: number | null
          superset_next_exercise_id?: string | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rpe?: number | null
          target_sets?: number | null
          target_weight_kg?: number | null
          user_id?: string | null
          workout_template_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          is_warmup?: boolean
          notes?: string | null
          order_index?: number
          rest_seconds?: number | null
          superset_next_exercise_id?: string | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rpe?: number | null
          target_sets?: number | null
          target_weight_kg?: number | null
          user_id?: string | null
          workout_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_template_exercises_superset_next_same_template_fkey"
            columns: ["workout_template_id", "superset_next_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_template_exercises"
            referencedColumns: ["workout_template_id", "id"]
          },
          {
            foreignKeyName: "workout_template_exercises_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_template_translations: {
        Row: {
          description: string | null
          id: string
          language_code: string | null
          name: string
          workout_template_id: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          language_code?: string | null
          name: string
          workout_template_id?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          language_code?: string | null
          name?: string
          workout_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_translations_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          base_name: string
          created_at: string
          description: string | null
          id: string
          modality: string | null
          source: string
          suggested_day_of_week: number | null
          updated_at: string
          user_id: string
          workout_goal: string | null
        }
        Insert: {
          base_name: string
          created_at?: string
          description?: string | null
          id?: string
          modality?: string | null
          source?: string
          suggested_day_of_week?: number | null
          updated_at?: string
          user_id: string
          workout_goal?: string | null
        }
        Update: {
          base_name?: string
          created_at?: string
          description?: string | null
          id?: string
          modality?: string | null
          source?: string
          suggested_day_of_week?: number | null
          updated_at?: string
          user_id?: string
          workout_goal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_username: { Args: { username_input: string }; Returns: boolean }
      delete_user_account: { Args: never; Returns: undefined }
      duplicate_recipe: { Args: { p_recipe_id: string }; Returns: string }
      ensure_recipe_ingredient: {
        Args: {
          p_barcode: string
          p_carbs_g_100: number
          p_category: Database["public"]["Enums"]["ingredients_category"]
          p_fat_g_100: number
          p_kcal_100: number
          p_name_en: string
          p_name_es: string
          p_name_norm_es: string
          p_protein_g_100: number
          p_source: Database["public"]["Enums"]["meal_items_source"]
        }
        Returns: string
      }
      ensure_recipe_public_slug: {
        Args: { p_recipe_id: string }
        Returns: string
      }
      import_ingredients_batch: { Args: { payload: Json }; Returns: number }
      import_recipes_batch: { Args: { payload: Json }; Returns: number }
      log_recipe_usage: {
        Args: {
          p_context: Database["public"]["Enums"]["recipe_usage_context_enum"]
          p_recipe_id: string
        }
        Returns: undefined
      }
      publish_recipe: { Args: { p_recipe_id: string }; Returns: undefined }
      refresh_recipe_popularity_aggregates: { Args: never; Returns: undefined }
      refresh_recipe_snapshot: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      reset_user_data: { Args: never; Returns: undefined }
      slugify_recipe_name: { Args: { p_name: string }; Returns: string }
      unpublish_recipe: { Args: { p_recipe_id: string }; Returns: undefined }
    }
    Enums: {
      activity_source_enum:
        | "manual"
        | "imported"
        | "strava"
        | "garmin"
        | "polar"
        | "gym_session"
      activity_status_enum: "active" | "completed" | "paused" | "cancelled"
      biomarker_type_enum:
        | "heart_rate"
        | "hrv_rmssd"
        | "hrv_sdnn"
        | "spo2"
        | "respiratory_rate"
        | "skin_temperature"
        | "body_temperature"
        | "movement"
        | "stress"
      daily_activity_enum: "sedentary" | "active" | "physical"
      daily_hydration_source: "manual" | "imported" | "ai"
      duration_type_enum: "time" | "distance" | "lap_button"
      exercise_load_type: "assisted" | "bodyweight" | "external" | "mixed"
      health_data_quality_enum:
        | "complete"
        | "partial"
        | "estimated"
        | "manual"
        | "unknown"
      ingredients_category:
        | "proteina_animal"
        | "proteina_vegetal"
        | "cereal"
        | "tuberculo"
        | "legumbre"
        | "verdura"
        | "fruta"
        | "lacteo"
        | "grasa"
        | "fruto_seco"
        | "semilla"
        | "bebida"
        | "condimento"
        | "otro"
        | "dulce"
        | "precocinado"
        | "snack"
      ingredients_unit_basis: "per_100g" | "per_100ml"
      language_code_enum: "es" | "en"
      lap_type_enum: "manual" | "auto" | "distance" | "time" | "unknown"
      meal_items_data_quality: "manual" | "automatic"
      meal_items_origin: "user" | "ai_name" | "ai_photo" | "imported"
      meal_items_source: "manual" | "database" | "openfoodfacts" | "custom"
      meal_logs_data_quality: "manual" | "computed"
      meal_logs_origin: "user" | "ai_name" | "ai_photo" | "imported"
      meal_type_enum:
        | "breakfast"
        | "lunch"
        | "dinner"
        | "snack"
        | "merienda"
        | "almuerzo"
      measurement_type_enum:
        | "waist"
        | "chest"
        | "hips"
        | "thigh"
        | "arm"
        | "calf"
        | "neck"
        | "shoulders"
        | "abdomen"
      notification_type:
        | "USER_FOLLOW_REQUEST"
        | "USER_FOLLOW_REQUEST_ACCEPTED"
        | "USER_FOLLOW_REQUEST_REJECTED"
      phase_type_enum: "warmup" | "interval" | "recovery" | "cooldown" | "relax"
      provider_enum:
        | "manual"
        | "strava"
        | "garmin"
        | "polar"
        | "fitbit"
        | "other"
        | "suunto"
        | "coros"
        | "apple_health"
        | "whoop"
        | "health_connect"
      recipe_items_unit: "g" | "ml"
      recipe_source_enum: "system" | "user"
      recipe_usage_context_enum: "meal_log" | "planner" | "quick_add"
      recipe_visibility_enum: "private" | "public"
      sleep_stage_enum:
        | "unknown"
        | "awake"
        | "awake_in_bed"
        | "out_of_bed"
        | "sleeping"
        | "light"
        | "deep"
        | "rem"
        | "core"
      sport_subtype_enum:
        | "road"
        | "trail"
        | "track"
        | "indoor"
        | "outdoor"
        | "pool"
        | "open_water"
        | "race"
        | "walk"
        | "gravel"
        | "spinning"
        | "urban"
        | "surf"
        | "longboard"
        | "shortboard"
        | "bodyboard"
        | "paddle_surf"
      sport_type_enum:
        | "basketball"
        | "padel"
        | "hiking"
        | "strength"
        | "running"
        | "cycling"
        | "swimming"
        | "football"
        | "tennis"
        | "other"
        | "gym"
        | "martial_arts"
        | "climbing"
        | "surf"
        | "volleyball"
        | "trail"
        | "skiing"
      stream_type_enum:
        | "heart_rate"
        | "cadence"
        | "power"
        | "altitude"
        | "speed"
        | "distance"
        | "temperature"
      target_type_enum:
        | "none"
        | "pace"
        | "heart_rate"
        | "power"
        | "speed"
        | "heart_rate_zone"
        | "rpe"
      training_frequency_enum: "none" | "occasional" | "frequent" | "athlete"
      user_nutrition_settings_activity_level:
        | "sedentary"
        | "light"
        | "moderate"
        | "high"
        | "very_high"
      user_nutrition_settings_adjustment_type: "percent" | "kcal"
      user_nutrition_settings_goal_mode: "lose" | "maintain" | "gain" | "recomp"
      user_nutrition_settings_primary_goal_mode:
        | "gain_strength"
        | "lose_weight"
        | "gain_muscle"
        | "recomp"
        | "maintain"
      user_preferences_distance_unit: "km" | "miles"
      user_preferences_energy_unit: "kcal" | "kj"
      user_preferences_language_code: "es" | "en"
      user_preferences_pace_unit: "min_km" | "min_mi"
      user_preferences_weight_unit: "kg" | "lb"
      users_sex: "male" | "female" | "other" | "prefer_not_to_say"
      visibility_enum: "private" | "followers" | "public"
      wearable_provider_enum:
        | "strava"
        | "garmin"
        | "polar"
        | "suunto"
        | "whoop"
        | "oura"
        | "fitbit"
        | "ultrahuman"
        | "apple_health"
        | "health_connect"
        | "manual"
        | "coros"
      workout_goal_enum:
        | "resistencia"
        | "fuerza"
        | "velocidad"
        | "potencia"
        | "hipertrofia"
        | "perdida_grasa"
      workout_plans_status: "planned" | "completed" | "skipped" | "rescheduled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_source_enum: [
        "manual",
        "imported",
        "strava",
        "garmin",
        "polar",
        "gym_session",
      ],
      activity_status_enum: ["active", "completed", "paused", "cancelled"],
      biomarker_type_enum: [
        "heart_rate",
        "hrv_rmssd",
        "hrv_sdnn",
        "spo2",
        "respiratory_rate",
        "skin_temperature",
        "body_temperature",
        "movement",
        "stress",
      ],
      daily_activity_enum: ["sedentary", "active", "physical"],
      daily_hydration_source: ["manual", "imported", "ai"],
      duration_type_enum: ["time", "distance", "lap_button"],
      exercise_load_type: ["assisted", "bodyweight", "external", "mixed"],
      health_data_quality_enum: [
        "complete",
        "partial",
        "estimated",
        "manual",
        "unknown",
      ],
      ingredients_category: [
        "proteina_animal",
        "proteina_vegetal",
        "cereal",
        "tuberculo",
        "legumbre",
        "verdura",
        "fruta",
        "lacteo",
        "grasa",
        "fruto_seco",
        "semilla",
        "bebida",
        "condimento",
        "otro",
        "dulce",
        "precocinado",
        "snack",
      ],
      ingredients_unit_basis: ["per_100g", "per_100ml"],
      language_code_enum: ["es", "en"],
      lap_type_enum: ["manual", "auto", "distance", "time", "unknown"],
      meal_items_data_quality: ["manual", "automatic"],
      meal_items_origin: ["user", "ai_name", "ai_photo", "imported"],
      meal_items_source: ["manual", "database", "openfoodfacts", "custom"],
      meal_logs_data_quality: ["manual", "computed"],
      meal_logs_origin: ["user", "ai_name", "ai_photo", "imported"],
      meal_type_enum: [
        "breakfast",
        "lunch",
        "dinner",
        "snack",
        "merienda",
        "almuerzo",
      ],
      measurement_type_enum: [
        "waist",
        "chest",
        "hips",
        "thigh",
        "arm",
        "calf",
        "neck",
        "shoulders",
        "abdomen",
      ],
      notification_type: [
        "USER_FOLLOW_REQUEST",
        "USER_FOLLOW_REQUEST_ACCEPTED",
        "USER_FOLLOW_REQUEST_REJECTED",
      ],
      phase_type_enum: ["warmup", "interval", "recovery", "cooldown", "relax"],
      provider_enum: [
        "manual",
        "strava",
        "garmin",
        "polar",
        "fitbit",
        "other",
        "suunto",
        "coros",
        "apple_health",
        "whoop",
        "health_connect",
      ],
      recipe_items_unit: ["g", "ml"],
      recipe_source_enum: ["system", "user"],
      recipe_usage_context_enum: ["meal_log", "planner", "quick_add"],
      recipe_visibility_enum: ["private", "public"],
      sleep_stage_enum: [
        "unknown",
        "awake",
        "awake_in_bed",
        "out_of_bed",
        "sleeping",
        "light",
        "deep",
        "rem",
        "core",
      ],
      sport_subtype_enum: [
        "road",
        "trail",
        "track",
        "indoor",
        "outdoor",
        "pool",
        "open_water",
        "race",
        "walk",
        "gravel",
        "spinning",
        "urban",
        "surf",
        "longboard",
        "shortboard",
        "bodyboard",
        "paddle_surf",
      ],
      sport_type_enum: [
        "basketball",
        "padel",
        "hiking",
        "strength",
        "running",
        "cycling",
        "swimming",
        "football",
        "tennis",
        "other",
        "gym",
        "martial_arts",
        "climbing",
        "surf",
        "volleyball",
        "trail",
        "skiing",
      ],
      stream_type_enum: [
        "heart_rate",
        "cadence",
        "power",
        "altitude",
        "speed",
        "distance",
        "temperature",
      ],
      target_type_enum: [
        "none",
        "pace",
        "heart_rate",
        "power",
        "speed",
        "heart_rate_zone",
        "rpe",
      ],
      training_frequency_enum: ["none", "occasional", "frequent", "athlete"],
      user_nutrition_settings_activity_level: [
        "sedentary",
        "light",
        "moderate",
        "high",
        "very_high",
      ],
      user_nutrition_settings_adjustment_type: ["percent", "kcal"],
      user_nutrition_settings_goal_mode: ["lose", "maintain", "gain", "recomp"],
      user_nutrition_settings_primary_goal_mode: [
        "gain_strength",
        "lose_weight",
        "gain_muscle",
        "recomp",
        "maintain",
      ],
      user_preferences_distance_unit: ["km", "miles"],
      user_preferences_energy_unit: ["kcal", "kj"],
      user_preferences_language_code: ["es", "en"],
      user_preferences_pace_unit: ["min_km", "min_mi"],
      user_preferences_weight_unit: ["kg", "lb"],
      users_sex: ["male", "female", "other", "prefer_not_to_say"],
      visibility_enum: ["private", "followers", "public"],
      wearable_provider_enum: [
        "strava",
        "garmin",
        "polar",
        "suunto",
        "whoop",
        "oura",
        "fitbit",
        "ultrahuman",
        "apple_health",
        "health_connect",
        "manual",
        "coros",
      ],
      workout_goal_enum: [
        "resistencia",
        "fuerza",
        "velocidad",
        "potencia",
        "hipertrofia",
        "perdida_grasa",
      ],
      workout_plans_status: ["planned", "completed", "skipped", "rescheduled"],
    },
  },
} as const

