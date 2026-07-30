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
      <svg
        aria-hidden
        className={compact ? "h-4 w-4" : "mr-1.5 h-4 w-4"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 5V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1M3 12h12M7 8l-4 4 4 4" />
      </svg>
      {!compact && "Déconnexion"}
    </button>
  );
}
