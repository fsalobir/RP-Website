"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ensureMj } from "./_auth";

function parseAttrs(attrsJson: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(attrsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Le JSON doit être un objet (ex: {\"gold\": 10})." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "JSON invalide." };
  }
}

export async function updateCharacterAttrs(characterId: string, attrsJson: string): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const parsed = parseAttrs(attrsJson);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("characters").update({ attrs: parsed.value }).eq("id", characterId);
  if (error) return { error: error.message };
  revalidatePath("/mj/entites");
  return {};
}

export async function updateItemAttrs(itemId: string, attrsJson: string): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const parsed = parseAttrs(attrsJson);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("items").update({ attrs: parsed.value }).eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/mj/entites");
  return {};
}

