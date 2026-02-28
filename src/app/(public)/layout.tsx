import { createClient } from "@/lib/supabase/server";
import { PublicNav } from "@/components/layout/PublicNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  let playerDisplayName: string | null = null;
  if (user) {
    const [adminRes, playerRes] = await Promise.all([
      supabase.from("admins").select("id").eq("user_id", user.id).single(),
      supabase.from("country_players").select("name, email").eq("user_id", user.id).maybeSingle(),
    ]);
    isAdmin = !!adminRes.data;
    const row = playerRes.data;
    playerDisplayName = (row?.name?.trim() || row?.email) ?? null;
  }
  return (
    <>
      <PublicNav
        isAdmin={isAdmin}
        playerDisplayName={playerDisplayName}
        isLoggedIn={!!user}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
