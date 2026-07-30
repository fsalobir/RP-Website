"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetAllCountriesStats } from "./actions";
import { useWorldActionLock } from "./WorldActionLock";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

export function ResetStatsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const { busy, run } = useWorldActionLock();

  async function handleClick() {
    await run(async () => {
      setLoading(true);
      setMessage(null);
      try {
        const result = await resetAllCountriesStats();
        if (result.error) {
          setMessage({ type: "error", text: result.error });
          return;
        }
        setMessage({ type: "ok", text: `${result.updated ?? 0} pays mis à jour.` });
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setMessage({ type: "error", text: "Les pays n’ont pas pu être réinitialisés. Réessayez." });
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="rounded py-2 px-4 text-sm font-medium opacity-90 hover:opacity-100 disabled:opacity-50"
        style={{ background: "var(--danger)", color: "#fff" }}
      >
        {loading ? "Réinitialisation…" : "Réinitialiser les valeurs des pays"}
      </button>
      {message && (
        <span
          role={message.type === "error" ? "alert" : "status"}
          className="text-sm"
          style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}
        >
          {message.text}
        </span>
      )}
      <AdminConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Réinitialiser tous les pays ?"
        consequence="Population : 50 Mio · PIB : 600 Bn · stabilité : 0 · militarisme, industrie et science : 5. Cette opération est irréversible."
        confirmLabel="Réinitialiser tous les pays"
        danger
        busy={loading}
        onConfirm={handleClick}
      />
    </div>
  );
}
