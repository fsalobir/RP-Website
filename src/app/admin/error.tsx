"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Administration indisponible</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          Les données n’ont pas pu être chargées. Aucun réglage n’a été modifié.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f1419]"
        >
          Réessayer
        </button>
      </section>
    </div>
  );
}
