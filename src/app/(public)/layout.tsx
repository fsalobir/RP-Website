import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { PublicNav } from "@/components/layout/PublicNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getCachedAuth();
  const { user, isAdmin, playerCountryId } = auth;

  let playerCountrySlug: string | null = null;
  if (user && !isAdmin && playerCountryId) {
    const supabase = await createClient();
    const { data: country } = await supabase
      .from("countries")
      .select("slug")
      .eq("id", playerCountryId)
      .single();
    playerCountrySlug = country?.slug ?? null;
  }

  return (
    <>
      <PublicNav
        isAdmin={isAdmin}
        playerDisplayName={auth.playerDisplayName}
        isLoggedIn={!!user}
        playerCountrySlug={playerCountrySlug}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
