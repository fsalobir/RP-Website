"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPlayer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const email = formData.get("email") as string | null;
  const password = formData.get("password") as string | null;
  const country_id = formData.get("country_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() || null;
  if (!email?.trim() || !password || !country_id) return { error: "Email, mot de passe et pays requis." };

  const admin = createServiceRoleClient();
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });

  let userId: string;
  if (createError) {
    const msg = createError.message ?? "";
    const isAlreadyRegistered =
      msg.includes("already been registered") ||
      msg.includes("already exists") ||
      msg.includes("already registered");
    if (!isAlreadyRegistered) return { error: createError.message };
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (!existing) return { error: "Un compte avec cet email existe mais n’a pas pu être trouvé." };
    userId = existing.id;
  } else if (!newUser?.user) {
    return { error: "Création utilisateur échouée." };
  } else {
    userId = newUser.user.id;
  }

  const { error: insertError } = await admin.from("country_players").upsert(
    { user_id: userId, country_id, email: email.trim(), name },
    { onConflict: "user_id" }
  );
  if (insertError) return { error: insertError.message };

  revalidatePath("/admin/joueurs");
  return { error: null, existingAssigned: !!createError };
}

export async function assignPlayer(user_id: string, country_id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { error } = await supabase
    .from("country_players")
    .update({ country_id })
    .eq("user_id", user_id);
  if (error) return { error: error.message };

  revalidatePath("/admin/joueurs");
  return { error: null };
}

export async function updatePlayerName(user_id: string, name: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { error } = await supabase
    .from("country_players")
    .update({ name: name?.trim() || null })
    .eq("user_id", user_id);
  if (error) return { error: error.message };

  revalidatePath("/admin/joueurs");
  return { error: null };
}

export async function deletePlayer(user_id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const admin = createServiceRoleClient();
  await admin.from("country_players").delete().eq("user_id", user_id);
  await admin.auth.admin.deleteUser(user_id);

  revalidatePath("/admin/joueurs");
  return { error: null };
}
