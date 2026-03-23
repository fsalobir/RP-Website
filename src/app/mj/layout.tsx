import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MjPageWrapper } from "./MjPageWrapper";

async function ensureMjOrRedirect() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/");

  const admin = createServiceRoleClient();
  const { data: mjRow, error } = await admin
    .from("mj_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !mjRow) redirect("/");
}

export default async function MjLayout({ children }: { children: React.ReactNode }) {
  await ensureMjOrRedirect();

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(245,158,11,0.10),transparent_55%),radial-gradient(900px_circle_at_80%_20%,rgba(34,197,94,0.08),transparent_50%),linear-gradient(to_bottom,rgba(2,6,12,1),rgba(10,15,23,1))] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-amber-500/20 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/mj" className="text-sm font-semibold tracking-wide text-amber-200 hover:text-amber-100">
              QG du Maître du Jeu
            </Link>
            <span className="text-xs text-white/30">•</span>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/mj" className="text-white/80 hover:text-white">
                Tableau de bord
              </Link>
              <Link href="/mj/carte" className="text-white/80 hover:text-white">
                Carte
              </Link>
              <Link href="/mj/carte-comparaison" className="text-white/80 hover:text-white">
                Cartes proto
              </Link>
              <Link href="/mj/entites" className="text-white/80 hover:text-white">
                Entités
              </Link>
              <Link href="/mj/royaumes" className="text-white/80 hover:text-white">
                Royaumes
              </Link>
            </nav>
          </div>
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Retour au site
          </Link>
        </div>
      </header>

      <MjPageWrapper>{children}</MjPageWrapper>
    </div>
  );
}

