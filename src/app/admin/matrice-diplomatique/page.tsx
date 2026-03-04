export default function AdminMatriceDiplomatiquePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Matrice Diplomatique
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        La modification des relations se fait dans la page <a href="/admin/regles" className="underline text-[var(--accent)] hover:opacity-90">Règles</a>, section « Matrice diplomatique ».
      </p>
    </div>
  );
}
