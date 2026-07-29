type PublicPageIcon = "world" | "map" | "ranking" | "ideology";

const iconPaths: Record<PublicPageIcon, React.ReactNode> = {
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.7 2.5 4 5.5 4 9s-1.3 6.5-4 9c-2.7-2.5-4-5.5-4-9s1.3-6.5 4-9Z" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  ranking: (
    <>
      <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" />
      <path d="M2 20h20" />
    </>
  ),
  ideology: (
    <>
      <path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" />
      <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
};

export function PublicPageHeader({
  title,
  icon,
}: {
  title: string;
  icon: PublicPageIcon;
}) {
  return (
    <header className="mb-6 flex items-center gap-3 text-white">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-black/25 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-[var(--accent)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {iconPaths[icon]}
        </svg>
      </span>
      <h1 className="text-balance text-2xl font-bold tracking-[-0.02em] drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] sm:text-3xl">
        {title}
      </h1>
    </header>
  );
}
