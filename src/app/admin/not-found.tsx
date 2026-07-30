import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Élément introuvable</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          Il a peut-être été supprimé ou vous n’y avez plus accès.
        </p>
        <Link href="/admin" className="mt-4 inline-flex rounded-lg border px-4 py-2 text-sm font-medium text-[var(--foreground)]" style={{ borderColor: "var(--border)" }}>
          Revenir au tableau de bord
        </Link>
      </section>
    </div>
  );
}
