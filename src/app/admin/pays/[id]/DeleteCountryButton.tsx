"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCountry } from "../actions";
import { AdminDialog } from "@/components/admin/AdminDialog";

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
    try {
      const result = await deleteCountry(countryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.push("/admin/pays");
      router.refresh();
    } catch {
      setError(`Impossible de supprimer « ${countryName} ». Vérifiez votre connexion puis réessayez.`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-red-500/10"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
      >
        Supprimer le pays
      </button>
      <AdminDialog
        open={confirming}
        onClose={() => { setConfirming(false); setError(null); }}
        title={`Supprimer « ${countryName} » ?`}
        description="Cette action est définitive."
        busy={deleting}
        size="sm"
        actions={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => { setConfirming(false); setError(null); }}
              disabled={deleting}
              autoFocus
              className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={deleting}
              className="min-h-11 rounded-lg bg-[var(--danger)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          Relations, effets, budget et historique liés à ce pays seront également supprimés.
        </p>
        {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      </AdminDialog>
    </>
  );
}
