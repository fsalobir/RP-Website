import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { PublicNav } from "@/components/layout/PublicNav";
import { PlayerAssistant } from "@/components/ai/PlayerAssistant";
import { getAiSettings } from "@/lib/ai/budget";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getCachedAuth();
  const { user, isAdmin, playerCountryId } = auth;

  let playerCountrySlug: string | null = null;
  let playerAssistantEnabled = false;
  if (user && !isAdmin && playerCountryId) {
    const supabase = await createClient();
    const { data: country } = await supabase
      .from("countries")
      .select("slug")
      .eq("id", playerCountryId)
      .single();
    playerCountrySlug = country?.slug ?? null;
    playerAssistantEnabled = await getAiSettings().then((settings) => settings.player_enabled).catch(() => false);
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
      {playerAssistantEnabled && <PlayerAssistant />}
    </>
  );
}
