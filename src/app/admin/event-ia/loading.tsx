export default function RpPipelineLoading() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6" aria-busy="true" aria-live="polite">
      <p className="text-sm font-medium text-[var(--foreground)]">Chargement du moteur RP…</p>
      <div className="mt-5 space-y-4" aria-hidden>
        <div className="h-16 max-w-xl animate-pulse rounded-xl bg-[var(--background-elevated)]" />
        <div className="grid overflow-hidden rounded-xl border border-[var(--border)] sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse border-r border-[var(--border)] bg-[var(--background-panel)] last:border-r-0" />)}
        </div>
        <div className="h-12 animate-pulse rounded bg-[var(--background-elevated)]" />
        <div className="h-80 animate-pulse rounded-xl bg-[var(--background-panel)]" />
      </div>
    </div>
  );
}
