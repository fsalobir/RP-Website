export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8" aria-busy="true" aria-live="polite">
      <p className="text-sm font-medium text-[var(--foreground)]">Chargement de l’administration…</p>
      <div className="mt-4 space-y-3" aria-hidden>
        <div className="h-10 w-64 animate-pulse rounded bg-[var(--background-elevated)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--background-panel)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--background-panel)]" />
      </div>
    </div>
  );
}
