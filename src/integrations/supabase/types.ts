export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_cron_token: {
        Row: {
          id: number
          token: string
          updated_at: string
        }
        Insert: {
          id?: number
          token: string
          updated_at?: string
        }
        Update: {
          id?: number
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      countdown_participants: {
        Row: {
          countdown_id: string
          id: string
          invited_at: string
          invited_by_member_id: string | null
          joined_at: string | null
          member_id: string
          status: string
        }
        Insert: {
          countdown_id: string
          id?: string
          invited_at?: string
          invited_by_member_id?: string | null
          joined_at?: string | null
          member_id: string
          status?: string
        }
        Update: {
          countdown_id?: string
          id?: string
          invited_at?: string
          invited_by_member_id?: string | null
          joined_at?: string | null
          member_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "countdown_participants_countdown_id_fkey"
            columns: ["countdown_id"]
            isOneToOne: false
            referencedRelation: "countdowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countdown_participants_invited_by_member_id_fkey"
            columns: ["invited_by_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countdown_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      countdown_push_log: {
        Row: {
          countdown_id: string
          id: string
          kind: string
          member_id: string
          sent_at: string
          sent_on: string
        }
        Insert: {
          countdown_id: string
          id?: string
          kind: string
          member_id: string
          sent_at?: string
          sent_on: string
        }
        Update: {
          countdown_id?: string
          id?: string
          kind?: string
          member_id?: string
          sent_at?: string
          sent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "countdown_push_log_countdown_id_fkey"
            columns: ["countdown_id"]
            isOneToOne: false
            referencedRelation: "countdowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countdown_push_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      countdowns: {
        Row: {
          created_at: string
          created_by_member_id: string
          emoji: string | null
          ends_at: string | null
          household_id: string
          id: string
          status: string
          target_at: string
          theme: string
          timezone: string | null
          title: string
          updated_at: string
          use_vacation_mode: boolean
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          emoji?: string | null
          ends_at?: string | null
          household_id: string
          id?: string
          status?: string
          target_at: string
          theme?: string
          timezone?: string | null
          title: string
          updated_at?: string
          use_vacation_mode?: boolean
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          emoji?: string | null
          ends_at?: string | null
          household_id?: string
          id?: string
          status?: string
          target_at?: string
          theme?: string
          timezone?: string | null
          title?: string
          updated_at?: string
          use_vacation_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "countdowns_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countdowns_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          id: string
          importance: number
          last_seen_at: string | null
          metadata: Json
          name: string
          owner_context: Database["public"]["Enums"]["owner_context"]
          slug: string
          summary: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          importance?: number
          last_seen_at?: string | null
          metadata?: Json
          name: string
          owner_context?: Database["public"]["Enums"]["owner_context"]
          slug: string
          summary?: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number
          last_seen_at?: string | null
          metadata?: Json
          name?: string
          owner_context?: Database["public"]["Enums"]["owner_context"]
          slug?: string
          summary?: string | null
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entity_relationships: {
        Row: {
          created_at: string
          from_entity_id: string
          id: string
          kind: Database["public"]["Enums"]["entity_relationship_kind"]
          metadata: Json
          to_entity_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_entity_id: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_relationship_kind"]
          metadata?: Json
          to_entity_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_entity_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_relationship_kind"]
          metadata?: Json
          to_entity_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_signals: {
        Row: {
          created_at: string
          entity_id: string
          external_ref: string
          id: string
          link_source: string
          occurred_at: string | null
          raw_signal_id: string | null
          signal_type: string
          snippet: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          external_ref: string
          id?: string
          link_source?: string
          occurred_at?: string | null
          raw_signal_id?: string | null
          signal_type: string
          snippet?: string | null
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          external_ref?: string
          id?: string
          link_source?: string
          occurred_at?: string | null
          raw_signal_id?: string | null
          signal_type?: string
          snippet?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_signals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_suggestions: {
        Row: {
          confidence: string
          created_at: string
          example_count: number
          id: string
          known_identity_id: string | null
          metadata: Json
          owner_context: Database["public"]["Enums"]["owner_context"] | null
          proposed_name: string
          proposed_type: Database["public"]["Enums"]["entity_type"]
          raw_signal_id: string | null
          reason: string
          snoozed_until: string | null
          status: string
          suggestion_key: string
          suggestion_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence: string
          created_at?: string
          example_count?: number
          id?: string
          known_identity_id?: string | null
          metadata?: Json
          owner_context?: Database["public"]["Enums"]["owner_context"] | null
          proposed_name: string
          proposed_type: Database["public"]["Enums"]["entity_type"]
          raw_signal_id?: string | null
          reason: string
          snoozed_until?: string | null
          status?: string
          suggestion_key: string
          suggestion_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          example_count?: number
          id?: string
          known_identity_id?: string | null
          metadata?: Json
          owner_context?: Database["public"]["Enums"]["owner_context"] | null
          proposed_name?: string
          proposed_type?: Database["public"]["Enums"]["entity_type"]
          raw_signal_id?: string | null
          reason?: string
          snoozed_until?: string | null
          status?: string
          suggestion_key?: string
          suggestion_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_suggestions_known_identity_id_fkey"
            columns: ["known_identity_id"]
            isOneToOne: false
            referencedRelation: "known_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comments: {
        Row: {
          body: string
          created_at: string
          event_id: string
          id: string
          sender_member_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event_id: string
          id?: string
          sender_member_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          sender_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_sender_member_id_fkey"
            columns: ["sender_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_visible_members: {
        Row: {
          created_at: string
          event_id: string
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_visible_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_visible_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          category_label_override: string | null
          created_at: string
          day_part: string
          day_part_end: string | null
          day_part_start: string | null
          end_date: string | null
          end_time: string | null
          event_date: string
          hide_from_other_calendars: boolean
          household_id: string
          id: string
          location: string | null
          notes: string | null
          owner_member_id: string
          priority: string
          start_time: string | null
          title: string
          updated_at: string
          visibility_type: string
        }
        Insert: {
          category: string
          category_label_override?: string | null
          created_at?: string
          day_part: string
          day_part_end?: string | null
          day_part_start?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date: string
          hide_from_other_calendars?: boolean
          household_id: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_member_id: string
          priority?: string
          start_time?: string | null
          title: string
          updated_at?: string
          visibility_type?: string
        }
        Update: {
          category?: string
          category_label_override?: string | null
          created_at?: string
          day_part?: string
          day_part_end?: string | null
          day_part_start?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date?: string
          hide_from_other_calendars?: boolean
          household_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_member_id?: string
          priority?: string
          start_time?: string | null
          title?: string
          updated_at?: string
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          household_id: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          household_id: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          household_id?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          avatar_url: string | null
          category_color_map: Json | null
          color_token: string
          created_at: string
          daily_digest_enabled: boolean
          daily_digest_last_sent_on: string | null
          daily_digest_time: string
          display_name: string
          household_id: string
          id: string
          is_active: boolean
          role: string
          show_in_other_calendars: boolean
          timezone: string
          updated_at: string
          user_id: string | null
          vacation_mode: Json | null
        }
        Insert: {
          avatar_url?: string | null
          category_color_map?: Json | null
          color_token?: string
          created_at?: string
          daily_digest_enabled?: boolean
          daily_digest_last_sent_on?: string | null
          daily_digest_time?: string
          display_name: string
          household_id: string
          id?: string
          is_active?: boolean
          role?: string
          show_in_other_calendars?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string | null
          vacation_mode?: Json | null
        }
        Update: {
          avatar_url?: string | null
          category_color_map?: Json | null
          color_token?: string
          created_at?: string
          daily_digest_enabled?: boolean
          daily_digest_last_sent_on?: string | null
          daily_digest_time?: string
          display_name?: string
          household_id?: string
          id?: string
          is_active?: boolean
          role?: string
          show_in_other_calendars?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string | null
          vacation_mode?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          locale: string
          name: string
          show_in_other_calendars: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          locale?: string
          name?: string
          show_in_other_calendars?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          locale?: string
          name?: string
          show_in_other_calendars?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      known_identities: {
        Row: {
          created_at: string
          display_name: string | null
          domain: string | null
          email: string | null
          entity_id: string | null
          external_key: string
          first_seen_at: string
          handle: string | null
          id: string
          identity_type: string
          ignored_at: string | null
          last_seen_at: string
          metadata: Json
          provider: string
          seen_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          domain?: string | null
          email?: string | null
          entity_id?: string | null
          external_key: string
          first_seen_at?: string
          handle?: string | null
          id?: string
          identity_type: string
          ignored_at?: string | null
          last_seen_at?: string
          metadata?: Json
          provider: string
          seen_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          domain?: string | null
          email?: string | null
          entity_id?: string | null
          external_key?: string
          first_seen_at?: string
          handle?: string | null
          id?: string
          identity_type?: string
          ignored_at?: string | null
          last_seen_at?: string
          metadata?: Json
          provider?: string
          seen_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "known_identities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      list_item_visible_members: {
        Row: {
          created_at: string
          id: string
          list_item_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_item_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_item_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_item_visible_members_list_item_id_fkey"
            columns: ["list_item_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_item_visible_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_checked: boolean
          item_date: string
          owner_member_id: string | null
          sort_order: number
          title: string
          updated_at: string
          visibility_type: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_checked?: boolean
          item_date: string
          owner_member_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          visibility_type?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_checked?: boolean
          item_date?: string
          owner_member_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_hidden_overlay_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_hidden_overlay_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_hidden_overlay_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_leak_events: {
        Row: {
          created_at: string
          event_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_leak_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_leak_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_signals: {
        Row: {
          created_at: string
          external_id: string | null
          external_thread_id: string | null
          id: string
          metadata: Json
          occurred_at: string | null
          parsed_at: string | null
          raw_text: string
          source: string
          status: string
          summary: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string | null
          parsed_at?: string | null
          raw_text: string
          source: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string | null
          parsed_at?: string | null
          raw_text?: string
          source?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      signal_identities: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          identity_id: string
          identity_role: string
          signal_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          identity_id: string
          identity_role: string
          signal_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          identity_id?: string
          identity_role?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_identities_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "known_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_identities_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "raw_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          app_locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_locale?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_current_user_edit_event: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      can_current_user_manage_countdown: {
        Args: { p_countdown_id: string }
        Returns: boolean
      }
      can_current_user_view_countdown: {
        Args: { p_countdown_id: string }
        Returns: boolean
      }
      can_current_user_view_event: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      can_current_user_view_list_item: {
        Args: { p_list_item_id: string }
        Returns: boolean
      }
      cancel_countdown: {
        Args: { p_countdown_id: string }
        Returns: {
          created_at: string
          created_by_member_id: string
          emoji: string | null
          ends_at: string | null
          household_id: string
          id: string
          status: string
          target_at: string
          theme: string
          timezone: string | null
          title: string
          updated_at: string
          use_vacation_mode: boolean
        }
        SetofOptions: {
          from: "*"
          to: "countdowns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_countdown: {
        Args: {
          p_emoji?: string
          p_ends_at?: string
          p_household_id: string
          p_invite_member_ids?: string[]
          p_target_at: string
          p_theme?: string
          p_timezone?: string
          p_title: string
          p_use_vacation_mode?: boolean
        }
        Returns: {
          created_at: string
          created_by_member_id: string
          emoji: string | null
          ends_at: string | null
          household_id: string
          id: string
          status: string
          target_at: string
          theme: string
          timezone: string | null
          title: string
          updated_at: string
          use_vacation_mode: boolean
        }
        SetofOptions: {
          from: "*"
          to: "countdowns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_event_for_current_member: {
        Args: {
          p_category?: string
          p_category_label_override?: string
          p_day_part?: string
          p_day_part_end?: string
          p_day_part_start?: string
          p_end_date?: string
          p_end_time?: string
          p_event_date: string
          p_hide_from_other_calendars?: boolean
          p_household_id: string
          p_location?: string
          p_notes?: string
          p_start_time?: string
          p_title: string
          p_visibility_type?: string
        }
        Returns: {
          category: string
          category_label_override: string | null
          created_at: string
          day_part: string
          day_part_end: string | null
          day_part_start: string | null
          end_date: string | null
          end_time: string | null
          event_date: string
          hide_from_other_calendars: boolean
          household_id: string
          id: string
          location: string | null
          notes: string | null
          owner_member_id: string
          priority: string
          start_time: string | null
          title: string
          updated_at: string
          visibility_type: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_household_invite: {
        Args: { p_household_id?: string }
        Returns: {
          code: string
          expires_at: string
          household_id: string
          invite_id: string
        }[]
      }
      create_household_with_owner: {
        Args: {
          p_color_token?: string
          p_display_name: string
          p_kind?: string
          p_locale?: string
          p_name: string
          p_show_in_other_calendars?: boolean
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          locale: string
          name: string
          show_in_other_calendars: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_member_ids: { Args: never; Returns: string[] }
      get_overlay_events_for_household: {
        Args: {
          p_end_date: string
          p_household_id: string
          p_start_date: string
        }
        Returns: {
          day_part: string
          day_part_end: string
          day_part_start: string
          end_date: string
          end_time: string
          event_date: string
          id: string
          source_household_id: string
          source_household_kind: string
          source_household_name: string
          source_member_id: string
          start_time: string
        }[]
      }
      hide_overlay_event_for_viewer: {
        Args: { p_event_id: string; p_viewer_household_id: string }
        Returns: undefined
      }
      invite_to_countdown: {
        Args: { p_countdown_id: string; p_member_ids: string[] }
        Returns: number
      }
      is_household_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: boolean
      }
      is_household_owner: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: boolean
      }
      is_own_active_household_member_row: {
        Args: { p_household_id: string; p_member_id: string }
        Returns: boolean
      }
      join_household_by_code: {
        Args: {
          p_color_token?: string
          p_display_name: string
          p_invite_code: string
        }
        Returns: string
      }
      leave_household: { Args: { p_household_id?: string }; Returns: Json }
      purge_account_data: { Args: never; Returns: Json }
      respond_to_countdown: {
        Args: { p_accept: boolean; p_countdown_id: string }
        Returns: {
          countdown_id: string
          id: string
          invited_at: string
          invited_by_member_id: string | null
          joined_at: string | null
          member_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "countdown_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_member_event_leak: {
        Args: { p_event_id: string; p_leak: boolean }
        Returns: undefined
      }
      sync_event_visible_members: {
        Args: { p_event_id: string; p_member_ids?: string[] }
        Returns: undefined
      }
      unhide_overlay_event_for_viewer: {
        Args: { p_event_id: string; p_viewer_household_id: string }
        Returns: undefined
      }
      update_countdown: {
        Args: {
          p_clear_ends_at?: boolean
          p_countdown_id: string
          p_ends_at?: string
          p_target_at?: string
          p_timezone?: string
          p_title?: string
          p_use_vacation_mode?: boolean
        }
        Returns: {
          created_at: string
          created_by_member_id: string
          emoji: string | null
          ends_at: string | null
          household_id: string
          id: string
          status: string
          target_at: string
          theme: string
          timezone: string | null
          title: string
          updated_at: string
          use_vacation_mode: boolean
        }
        SetofOptions: {
          from: "*"
          to: "countdowns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      entity_relationship_kind:
        | "works_on"
        | "customer_of"
        | "member_of"
        | "owns"
        | "blocked_by"
        | "related_to"
      entity_type: "person" | "company" | "project" | "goal" | "commitment"
      owner_context: "personal" | "peder-enk" | "gold-of-sicily" | "unknown"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      entity_relationship_kind: [
        "works_on",
        "customer_of",
        "member_of",
        "owns",
        "blocked_by",
        "related_to",
      ],
      entity_type: ["person", "company", "project", "goal", "commitment"],
      owner_context: ["personal", "peder-enk", "gold-of-sicily", "unknown"],
    },
  },
} as const
