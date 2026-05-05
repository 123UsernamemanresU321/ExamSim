import type { AppRole, AttemptState, DeliveryMode } from "@/lib/constants";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  auth_user_id: string;
  app_role: AppRole;
  display_name: string;
  owner_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Attempt = {
  id: string;
  assessment_id: string;
  assessment_version_id: string;
  assignee_profile_id: string;
  start_at_utc: string;
  duration_seconds: number;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  display_timezone: string;
  delivery_mode: DeliveryMode;
  solutions_requested: boolean;
  typed_enabled: boolean;
  per_question_upload_enabled: boolean;
  require_blank_for_skipped: boolean;
  state_cache: AttemptState | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "auth_user_id" | "app_role" | "display_name">;
        Update: Partial<Profile>;
      };
      attempts: {
        Row: Attempt;
        Insert: Omit<Attempt, "created_at" | "updated_at" | "state_cache"> & {
          state_cache?: AttemptState | null;
        };
        Update: Partial<Attempt>;
      };
    };
  };
};
