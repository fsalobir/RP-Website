"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-12">
      <section className="w-full rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <p className="text-sm font-medium text-[var(--danger)]">La page n’a pas pu être chargée.</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Vos données n’ont pas été modifiées. Vous pouvez réessayer sans recharger tout le site.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419]"
        >
          Réessayer
        </button>
      </section>
    </main>
  );
}
