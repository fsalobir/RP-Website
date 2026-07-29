"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function AdminSignOut() {
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
      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded px-2 text-sm whitespace-nowrap text-[var(--foreground-muted)] transition-colors hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span aria-hidden className="mr-1.5">🚪</span>Déconnexion
    </button>
  );
}
