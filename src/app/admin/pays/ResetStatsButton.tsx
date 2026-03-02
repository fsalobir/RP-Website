"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetAllCountriesStats } from "./actions";

export function ResetStatsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "Réinitialiser les stats de tous les pays ?\n\n" +
        "• Population : 50 Mio\n• PIB : 600 Bn\n• Stabilité : 0\n• Militarisme, Industrie, Science : 5\n\n" +
        "Cette action est irréversible."
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    const result = await resetAllCountriesStats();
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
        style={{ background: "var(--danger)", color: "#fff" }}
      >
        {loading ? "En cours…" : "Réinitialiser les stats (tous les pays)"}
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
