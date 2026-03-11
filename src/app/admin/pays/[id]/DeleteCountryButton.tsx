"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCountry } from "../actions";

export function DeleteCountryButton({
  countryId,
  countryName,
}: {
  countryId: string;
  countryName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setDeleting(true);
    const result = await deleteCountry(countryId);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.push("/admin/pays");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
      >
        Supprimer le pays
      </button>
    );
  }

  return (
    <div
      className="mt-6 rounded-lg border p-4"
      style={{ background: "var(--background-panel)", borderColor: "var(--danger)" }}
    >
      <p className="mb-2 font-medium text-[var(--foreground)]">
        Supprimer « {countryName} » ?
      </p>
      <p className="mb-4 text-sm text-[var(--foreground-muted)]">
        Cette action est irréversible. Toutes les données liées (relations, effets, budget, etc.) seront supprimées.
      </p>
      {error && (
        <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {deleting ? "Suppression…" : "Confirmer la suppression"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={deleting}
          className="rounded border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
