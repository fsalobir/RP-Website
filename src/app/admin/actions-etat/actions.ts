"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateStateActionType(
  id: string,
  data: { label_fr?: string; cost?: number; params_schema?: Record<string, unknown> }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("state_action_types")
    .update({
      ...(data.label_fr !== undefined && { label_fr: data.label_fr }),
      ...(data.cost !== undefined && { cost: data.cost }),
      ...(data.params_schema !== undefined && { params_schema: data.params_schema }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/actions-etat");
  revalidatePath("/admin/demandes");
  return {};
}
