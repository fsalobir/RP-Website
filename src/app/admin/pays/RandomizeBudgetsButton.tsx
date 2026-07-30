"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { randomizeNationalBudgets } from "./actions";
import { useWorldActionLock } from "./WorldActionLock";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

export function RandomizeBudgetsButton() {
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
        const result = await randomizeNationalBudgets();
        if (result.error) {
          setMessage({ type: "error", text: result.error });
          return;
        }
        setMessage({ type: "ok", text: `${result.updated ?? 0} pays mis à jour.` });
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setMessage({ type: "error", text: "Les budgets n’ont pas pu être attribués. Réessayez." });
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
        style={{ background: "var(--background-elevated)", color: "var(--foreground)", border: "1px solid var(--border)" }}
      >
        {loading ? "Attribution…" : "Attribuer des budgets aléatoires"}
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
        title="Attribuer de nouveaux budgets ?"
        consequence="Tous les budgets nationaux seront remplacés. Les minimums imposés par les effets et le total de 100 % resteront respectés."
        confirmLabel="Attribuer les budgets"
        busy={loading}
        onConfirm={handleClick}
      />
    </div>
  );
}
