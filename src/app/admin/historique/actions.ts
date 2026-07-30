"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function restoreAdminChange(changeId: string): Promise<{ error?: string }> {
  if (!changeId) return { error: "Modification introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_restore_change", {
    p_log_id: changeId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return {};
}
