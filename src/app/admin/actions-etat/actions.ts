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
  expected_updated_at: string;
};

export async function updateStateActionTypes(rows: StateActionTypeUpdate[]): Promise<{
  error?: string;
  updatedAtById?: Record<string, string>;
}> {
  if (rows.length === 0) return {};
  if (rows.length > 100) return { error: "Trop de réglages envoyés en une fois." };
  if (rows.some((row) => !Number.isInteger(row.cost) || row.cost < 0)) {
    return { error: "Le coût de chaque action doit être un nombre entier positif ou nul." };
  }
  if (rows.some((row) => !row.expected_updated_at)) {
    return { error: "Une action est incomplète. Rechargez la page." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_state_action_types", {
    p_rows: rows,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/actions-etat");
  revalidatePath("/admin/demandes");
  const updatedAtById = Object.fromEntries(
    ((data ?? []) as Array<{ result_id: string; result_updated_at: string }>).map((row) => [
      row.result_id,
      row.result_updated_at,
    ])
  );
  return { updatedAtById };
}
