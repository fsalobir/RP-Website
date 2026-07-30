"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runDailyCountryUpdate } from "./actions";

export function AdvanceDayButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "Appliquer un jour de simulation ?\n\n" +
        "L’état actuel sera ajouté à l’historique, puis la population, le PIB, les statistiques, les lois et la date du monde seront mis à jour."
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    const result = await runDailyCountryUpdate();
    setLoading(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "ok", text: "Jour passé. Données mises à jour." });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded py-2 px-4 text-sm font-medium opacity-90 hover:opacity-100 disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0f1419" }}
      >
        {loading ? "Mise à jour…" : "Appliquer un jour"}
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
