"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSignOut({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("La déconnexion n’a pas pu être confirmée. Réessayez.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Déconnexion impossible. Vérifiez votre connexion internet, puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        aria-label={compact ? (loading ? "Déconnexion en cours" : "Se déconnecter") : undefined}
        aria-busy={loading}
        title={compact ? "Se déconnecter" : undefined}
        className={`inline-flex min-h-11 cursor-pointer items-center rounded text-sm whitespace-nowrap text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-wait disabled:opacity-60 ${
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
        {!compact && (loading ? "Déconnexion…" : "Déconnexion")}
      </button>
      {error && (
        <p
          className="absolute right-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-[var(--danger)]/40 bg-[var(--background-elevated)] p-3 text-sm whitespace-normal text-[var(--danger)] shadow-lg"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
