"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function AdminSignOut() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/connexion");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm text-[var(--foreground-muted)] hover:text-[var(--danger)] transition-colors whitespace-nowrap"
    >
      <span aria-hidden className="mr-1.5">🚪</span>Déconnexion
    </button>
  );
}
