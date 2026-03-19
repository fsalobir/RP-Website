export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Types Fantasy "curatés" basés sur `supabase/migrations/0000_initial_fantasy_schema.sql`.
 *
 * Note: `supabase gen types --linked` peut inclure des tables héritées encore présentes dans la DB remote.
 * Ce fichier expose uniquement le noyau Fantasy (realms/provinces/resource_kinds/effects).
 */

export type UUID = string;
export type Timestamp = string; // timestamptz ISO

export interface Realm {
  id: UUID;
  slug: string;
  name: string;
  player_user_id: UUID | null;
  is_npc: boolean;
  settings: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Province {
  id: UUID;
  realm_id: UUID;
  name: string;
  map_ref: string | null;
  attrs: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ResourceKind {
  id: UUID;
  key: string;
  label_fr: string;
  unit_label_fr: string | null;
  decimals: number;
  is_hidden_by_default: boolean;
  meta: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type EffectTargetType = "realm" | "province" | "character" | "race" | "item" | "poi";

export type EffectDurationKind = "days" | "updates" | "permanent";

export interface Effect {
  id: UUID;
  effect_kind: string;
  value: string; // numeric en Postgres (à parser en number côté app si besoin)
  duration_kind: EffectDurationKind;
  duration_remaining: number | null;
  source_label: string | null;
  created_by_user_id: UUID | null;
  target_type: EffectTargetType;
  target_id: UUID;
  target_subkey: string | null;
  scope: Json;
  meta: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

