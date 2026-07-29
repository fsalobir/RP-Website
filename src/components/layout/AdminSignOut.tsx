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
      className="inline-flex min-h-11 w-full cursor-pointer items-center rounded px-2 text-sm whitespace-nowrap text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:w-auto"
    >
      <span aria-hidden className="mr-1.5">🚪</span>Déconnexion
    </button>
  );
}
