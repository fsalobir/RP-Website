"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ensureMj } from "./_auth";

type RealmInput = {
  name: string;
  slug: string;
  is_npc?: boolean;
  color_hex?: string | null;
  banner_url?: string | null;
  summary?: string | null;
  leader_name?: string | null;
  capital_city_id?: string | null;
};

function normalizeSlug(slug: string) {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function validateColorHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toLowerCase();
}

export async function createRealm(input: RealmInput): Promise<{ error?: string; id?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  if (!name) return { error: "Nom du royaume requis." };
  if (!slug) return { error: "Slug invalide." };

  const admin = createServiceRoleClient();
  const payload = {
    name,
    slug,
    is_npc: Boolean(input.is_npc ?? false),
    color_hex: validateColorHex(input.color_hex) ?? undefined,
    banner_url: input.banner_url?.trim() || null,
    summary: input.summary?.trim() || null,
    leader_name: input.leader_name?.trim() || null,
    capital_city_id: input.capital_city_id?.trim() || null,
  };
  const { data, error } = await admin.from("realms").insert(payload).select("id").maybeSingle();
  if (error) return { error: error.message };

  await admin.from("realm_audit_logs").insert({
    realm_id: data?.id ?? null,
    actor_user_id: user?.id ?? null,
    action: "realm_created",
    details: payload,
  });

  revalidatePath("/mj/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/royaumes");
  revalidatePath("/");
  return { id: data?.id as string | undefined };
}

export async function updateRealm(input: RealmInput & { id: string }): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };
  const id = input.id.trim();
  if (!id) return { error: "Royaume invalide." };
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  if (!name || !slug) return { error: "Nom/slug invalides." };

  const admin = createServiceRoleClient();
  const payload = {
    name,
    slug,
    is_npc: Boolean(input.is_npc ?? false),
    color_hex: validateColorHex(input.color_hex),
    banner_url: input.banner_url?.trim() || null,
    summary: input.summary?.trim() || null,
    leader_name: input.leader_name?.trim() || null,
    capital_city_id: input.capital_city_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("realms").update(payload).eq("id", id);
  if (error) return { error: error.message };

  await admin.from("realm_audit_logs").insert({
    realm_id: id,
    actor_user_id: user?.id ?? null,
    action: "realm_updated",
    details: payload,
  });

  revalidatePath("/mj/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/royaumes");
  revalidatePath("/");
  return {};
}

export async function assignRealmPlayer(args: {
  realm_id: string;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
}): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };
  const realmId = args.realm_id.trim();
  if (!realmId) return { error: "Royaume invalide." };

  const inputUserId = args.user_id?.trim() || null;
  const email = args.email?.trim().toLowerCase() || null;
  const displayName = args.display_name?.trim() || null;
  const admin = createServiceRoleClient();

  let matchedUserId: string | null = null;
  if (inputUserId) {
    matchedUserId = inputUserId;
  } else if (email) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const found = data?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    matchedUserId = found?.id ?? null;
  }

  const assignmentPayload = {
    realm_id: realmId,
    user_id: matchedUserId,
    email,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await admin
    .from("realm_player_assignments")
    .upsert(assignmentPayload, { onConflict: "realm_id" });
  if (upsertErr) return { error: upsertErr.message };

  const { error: realmErr } = await admin
    .from("realms")
    .update({ player_user_id: matchedUserId, updated_at: new Date().toISOString() })
    .eq("id", realmId);
  if (realmErr) return { error: realmErr.message };

  await admin.from("realm_audit_logs").insert({
    realm_id: realmId,
    actor_user_id: user?.id ?? null,
    action: "realm_player_assigned",
    details: assignmentPayload,
  });

  revalidatePath("/mj/royaumes");
  revalidatePath("/mj");
  revalidatePath("/mj/carte");
  revalidatePath("/royaumes");
  revalidatePath("/");
  return {};
}

export async function updateProvinceCapital(args: {
  province_id: string;
  capital_city_id?: string | null;
}): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };
  const provinceId = args.province_id.trim();
  if (!provinceId) return { error: "Province invalide." };

  const admin = createServiceRoleClient();
  const payload = {
    capital_city_id: args.capital_city_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("provinces").update(payload).eq("id", provinceId);
  if (error) return { error: error.message };

  await admin.from("realm_audit_logs").insert({
    realm_id: null,
    actor_user_id: user?.id ?? null,
    action: "province_capital_updated",
    details: { province_id: provinceId, ...payload },
  });

  revalidatePath("/mj/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  revalidatePath("/");
  return {};
}

export async function updateRealmNationalCapital(args: {
  realm_id: string;
  capital_city_id?: string | null;
}): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };
  const realmId = args.realm_id.trim();
  if (!realmId) return { error: "Royaume invalide." };

  const admin = createServiceRoleClient();
  const payload = {
    capital_city_id: args.capital_city_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("realms").update(payload).eq("id", realmId);
  if (error) return { error: error.message };

  await admin.from("realm_audit_logs").insert({
    realm_id: realmId,
    actor_user_id: user?.id ?? null,
    action: "realm_capital_updated",
    details: payload,
  });

  revalidatePath("/mj/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  revalidatePath("/");
  return {};
}

