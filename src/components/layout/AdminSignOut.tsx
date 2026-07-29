"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function AdminSignOut({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      aria-label={compact ? "Se déconnecter" : undefined}
      title={compact ? "Se déconnecter" : undefined}
      className={`inline-flex min-h-11 cursor-pointer items-center rounded text-sm whitespace-nowrap text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        compact ? "w-11 justify-center" : "w-full px-2 sm:w-auto"
      }`}
    >
      <span aria-hidden className={compact ? "" : "mr-1.5"}>🚪</span>
      {!compact && "Déconnexion"}
    </button>
  );
}
