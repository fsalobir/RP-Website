"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { randomizeNationalBudgets } from "./actions";

export function RandomizeBudgetsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "Attribuer des budgets nationaux aléatoires à tous les pays ?\n\n" +
        "Les minimums forcés (effets) et le plafond d'allocation sont respectés."
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    const result = await randomizeNationalBudgets();
    setLoading(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "ok", text: `${result.updated ?? 0} pays mis à jour.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded py-2 px-4 text-sm font-medium opacity-90 hover:opacity-100 disabled:opacity-50"
        style={{ background: "var(--background-elevated)", color: "var(--foreground)", border: "1px solid var(--border)" }}
      >
        {loading ? "En cours…" : "Randomiser budgets nationaux"}
      </button>
      {message && (
        <span
          className="text-sm"
          style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
