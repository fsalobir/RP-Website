import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [countriesRes, rulesRes] = await Promise.all([
    supabase.from("countries").select("id", { count: "exact", head: true }),
    supabase.from("rule_parameters").select("id", { count: "exact", head: true }),
  ]);
  const countriesCount = countriesRes.count ?? 0;
  const rulesCount = rulesRes.count ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Tableau de bord
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Vue d’ensemble et accès rapide aux données.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/pays"
          className="rounded-lg border p-6 transition-colors hover:border-[var(--accent-muted)]"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Pays
          </h2>
          <p className="mt-1 text-2xl font-mono font-semibold tabular-nums text-[var(--accent)]">
            {countriesCount}
          </p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Gérer les nations et leurs indicateurs
          </p>
        </Link>
        <Link
          href="/admin/regles"
          className="rounded-lg border p-6 transition-colors hover:border-[var(--accent-muted)]"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Règles
          </h2>
          <p className="mt-1 text-2xl font-mono font-semibold tabular-nums text-[var(--accent)]">
            {rulesCount}
          </p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Paramètres de simulation (cron)
          </p>
        </Link>
        <Link
          href="/"
          className="rounded-lg border p-6 transition-colors hover:border-[var(--accent-muted)]"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Voir le site
          </h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Ouvrir le site public
          </p>
        </Link>
      </div>
    </div>
  );
}
