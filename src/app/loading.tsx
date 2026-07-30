export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4 py-12">
      <div role="status" className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
        <span
          aria-hidden
          className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] motion-reduce:animate-none"
        />
        Chargement…
      </div>
    </main>
  );
}
