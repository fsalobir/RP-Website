"use client";

export default function RpPipelineError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Le moteur RP ne répond pas</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
          Les actions et les publications n’ont pas pu être chargées. Aucune donnée n’a été modifiée.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)]"
        >
          Réessayer
        </button>
      </section>
    </div>
  );
}
