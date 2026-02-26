import { CountryForm } from "@/components/admin/CountryForm";

export default function AdminPaysNouveauPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Nouveau pays
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Remplissez les champs puis enregistrez.
      </p>
      <CountryForm />
    </div>
  );
}
