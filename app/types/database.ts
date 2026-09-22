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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          player_id: string | null
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          player_id?: string | null
          role: string
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          player_id?: string | null
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_player_id_players_id_fk"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          jersey_number: number | null
          last_updated_at: string
          last_updated_by: string | null
          linked_user_id: string | null
          name: string
          photo_consent: boolean
          position: string | null
          team_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          jersey_number?: number | null
          last_updated_at?: string
          last_updated_by?: string | null
          linked_user_id?: string | null
          name: string
          photo_consent?: boolean
          position?: string | null
          team_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          jersey_number?: number | null
          last_updated_at?: string
          last_updated_by?: string | null
          linked_user_id?: string | null
          name?: string
          photo_consent?: boolean
          position?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      point_categories: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          last_updated_at: string
          last_updated_by: string | null
          name: string
          sort_order: number
          team_id: string
          value_max: number
          value_min: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          name: string
          sort_order: number
          team_id: string
          value_max: number
          value_min: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          team_id?: string
          value_max?: number
          value_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_categories_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      point_entries: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          last_updated_at: string
          last_updated_by: string | null
          player_id: string
          training_id: string
          value: number
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          player_id: string
          training_id: string
          value: number
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          player_id?: string
          training_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_entries_category_id_point_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "point_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_entries_player_id_players_id_fk"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_entries_training_id_trainings_id_fk"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      team_settings: {
        Row: {
          season_start: string
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          season_start?: string
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          season_start?: string
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_settings_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_updated_at: string
          last_updated_by: string | null
          name: string
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          name: string
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          name?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      training_photos: {
        Row: {
          content_type: string
          id: string
          size_bytes: number
          storage_path: string
          training_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          content_type: string
          id?: string
          size_bytes: number
          storage_path: string
          training_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          id?: string
          size_bytes?: number
          storage_path?: string
          training_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_photos_training_id_trainings_id_fk"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          last_updated_at: string
          last_updated_by: string | null
          note: string | null
          status: string
          team_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          note?: string | null
          status?: string
          team_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          last_updated_at?: string
          last_updated_by?: string | null
          note?: string | null
          status?: string
          team_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainings_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_path: string | null
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_path?: string | null
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_path?: string | null
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      veo_match_stats: {
        Row: {
          category: string
          created_at: string
          match_id: string
          period_values: Json
          stat_type: string
          team_association: string
          value: number
        }
        Insert: {
          category: string
          created_at?: string
          match_id: string
          period_values: Json
          stat_type: string
          team_association: string
          value: number
        }
        Update: {
          category?: string
          created_at?: string
          match_id?: string
          period_values?: Json
          stat_type?: string
          team_association?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "veo_match_stats_match_id_veo_matches_id_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "veo_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      veo_matches: {
        Row: {
          created_at: string
          home_or_away: string
          id: string
          last_synced_at: string
          opponent_name: string
          opponent_score: number
          own_score: number
          played_at: string
          team_id: string
          veo_match_id: string
        }
        Insert: {
          created_at?: string
          home_or_away: string
          id?: string
          last_synced_at?: string
          opponent_name: string
          opponent_score: number
          own_score: number
          played_at: string
          team_id: string
          veo_match_id: string
        }
        Update: {
          created_at?: string
          home_or_away?: string
          id?: string
          last_synced_at?: string
          opponent_name?: string
          opponent_score?: number
          own_score?: number
          played_at?: string
          team_id?: string
          veo_match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veo_matches_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      veo_sync_credentials: {
        Row: {
          captured_at: string
          session_cookie: string
          team_id: string
          updated_at: string
        }
        Insert: {
          captured_at: string
          session_cookie: string
          team_id: string
          updated_at?: string
        }
        Update: {
          captured_at?: string
          session_cookie?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veo_sync_credentials_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      veo_sync_status: {
        Row: {
          consecutive_failures: number
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veo_sync_status_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      veo_team_mappings: {
        Row: {
          created_at: string
          enabled: boolean
          team_id: string
          updated_at: string
          veo_club_slug: string
          veo_team_slug: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          team_id: string
          updated_at?: string
          veo_club_slug: string
          veo_team_slug: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          team_id?: string
          updated_at?: string
          veo_club_slug?: string
          veo_team_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "veo_team_mappings_team_id_teams_id_fk"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string; p_user_email: string; p_user_id: string }
        Returns: {
          already_accepted: boolean
          slug: string
        }[]
      }
      create_team_with_trainer: {
        Args: { p_name: string; p_slug: string; p_user_id: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      get_player_scores_by_category: {
        Args: { p_from: string; p_player: string; p_team: string; p_to: string }
        Returns: {
          avg_value: number
          category_id: string
          category_name: string
          median_value: number
          sort_order: number
          sum_value: number
        }[]
      }
      get_public_ranking: {
        Args: { p_from: string; p_slug: string; p_to: string }
        Returns: Json
      }
      get_team_ranking: {
        Args: { p_from: string; p_team: string; p_to: string }
        Returns: Json
      }
      has_pending_invitation: { Args: { p_team: string }; Returns: boolean }
      is_member: { Args: { p_team: string }; Returns: boolean }
      is_profile_visible: { Args: { p_profile: string }; Returns: boolean }
      is_trainer: { Args: { p_team: string }; Returns: boolean }
      is_veo_enabled: { Args: { p_team: string }; Returns: boolean }
      reorder_point_categories: {
        Args: { p_items: Json; p_team: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

