import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminNav } from "@/components/layout/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getCachedAuth();

  if (!auth.user) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 border-b bg-[var(--background-elevated)]" style={{ borderColor: "var(--border)" }}>
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-semibold text-[var(--foreground)] hover:text-[var(--accent)] transition-colors">
              Simulateur de nations
            </Link>
            <nav className="flex items-center gap-5">
              <Link href="/" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap">
                <span aria-hidden className="mr-1.5">🌍</span>Pays
              </Link>
              <Link href="/classement" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap">
                <span aria-hidden className="mr-1.5">📊</span>Classement
              </Link>
              <div className="h-5 w-px bg-[var(--border)]" role="separator" />
              <Link href="/admin/connexion" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors whitespace-nowrap">
                <span aria-hidden className="mr-1.5">🔐</span>Connexion
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  if (!auth.isAdmin) {
    if (auth.playerCountryId) {
      const supabase = await createClient();
      const { data: country } = await supabase.from("countries").select("slug").eq("id", auth.playerCountryId).single();
      if (country?.slug) redirect(`/pays/${country.slug}`);
    }
    redirect("/admin/connexion?error=non-admin");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
