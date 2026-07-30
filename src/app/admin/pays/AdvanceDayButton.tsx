"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runDailyCountryUpdate } from "./actions";
import { useWorldActionLock } from "./WorldActionLock";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

export function AdvanceDayButton() {
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
        const result = await runDailyCountryUpdate();
        if (result.error) {
          setMessage({ type: "error", text: result.error });
          return;
        }
        setMessage({ type: "ok", text: "Jour passé. Données mises à jour." });
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setMessage({ type: "error", text: "La simulation n’a pas pu avancer. Réessayez." });
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
        style={{ background: "var(--accent)", color: "#0f1419" }}
      >
        {loading ? "Mise à jour…" : "Appliquer un jour"}
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
        title="Appliquer un jour de simulation ?"
        consequence="L’état actuel sera ajouté à l’historique, puis la population, le PIB, les statistiques, les lois et la date du monde seront mis à jour."
        confirmLabel="Appliquer le jour"
        busy={loading}
        onConfirm={handleClick}
      />
    </div>
  );
}
