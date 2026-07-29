"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type StateActionTypeUpdate = {
  id: string;
  key: string;
  label_fr: string;
  cost: number;
  params_schema: Record<string, unknown>;
  sort_order: number;
};

export async function updateStateActionTypes(rows: StateActionTypeUpdate[]) {
  if (rows.length === 0) return {};
  if (rows.length > 100) return { error: "Trop de réglages envoyés en une fois." };
  if (rows.some((row) => !Number.isInteger(row.cost) || row.cost < 0)) {
    return { error: "Le coût de chaque action doit être un nombre entier positif ou nul." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("state_action_types")
    .upsert(rows, { onConflict: "id" });

  if (error) return { error: error.message };
  revalidatePath("/admin/actions-etat");
  revalidatePath("/admin/demandes");
  return {};
}
