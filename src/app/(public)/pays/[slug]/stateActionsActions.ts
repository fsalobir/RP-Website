"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function submitStateActionRequest(
  countryId: string,
  actionTypeId: string,
  payload: Record<string, unknown>
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("user_id", user.id)
    .eq("country_id", countryId)
    .maybeSingle();
  if (!playerRow) return { error: "Vous n'êtes pas le joueur de ce pays." };

  const { data: actionType, error: typeErr } = await supabase
    .from("state_action_types")
    .select("id, cost")
    .eq("id", actionTypeId)
    .single();
  if (typeErr || !actionType) return { error: "Type d'action introuvable." };
  const cost = (actionType.cost ?? 1) as number;

  const { data: balanceRow } = await supabase
    .from("country_state_action_balance")
    .select("balance")
    .eq("country_id", countryId)
    .maybeSingle();
  const current = (balanceRow?.balance ?? 0) as number;
  if (current < cost) return { error: `Solde insuffisant (${current} action(s), coût ${cost}).` };

  const { error: insErr } = await supabase.from("state_action_requests").insert({
    country_id: countryId,
    user_id: user.id,
    action_type_id: actionTypeId,
    status: "pending",
    payload,
  });
  if (insErr) return { error: insErr.message };

  // UPDATE uniquement : la RLS n'autorise l'INSERT joueur que si balance = 0
  const { data: updated, error: balErr } = await supabase
    .from("country_state_action_balance")
    .update({ balance: current - cost, updated_at: new Date().toISOString() })
    .eq("country_id", countryId)
    .gte("balance", cost)
    .select("country_id")
    .maybeSingle();
  if (balErr) return { error: balErr.message };
  if (!updated) return { error: "Solde insuffisant ou ligne de solde absente." };

  revalidatePath("/pays");
  revalidatePath("/admin/demandes");
  return {};
}
