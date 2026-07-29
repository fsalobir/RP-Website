import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-12">
      <section className="w-full rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--foreground-muted)]">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">Cette page n’existe pas.</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Le lien est peut-être ancien ou l’élément a été supprimé.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419]"
        >
          Retour à l’accueil
        </Link>
      </section>
    </main>
  );
}
