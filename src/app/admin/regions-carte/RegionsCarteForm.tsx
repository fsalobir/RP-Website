"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetMapRegions } from "./actions";

type Region = {
  id: string;
  name: string;
  slug: string;
  country_count: number;
  country_names: string[];
};

export function RegionsCarteForm({ regions }: { regions: Region[] }) {
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleReset = () => {
    if (!window.confirm("Supprimer toutes les régions de la carte ? Relancez le script seed pour restaurer la carte par défaut.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resetMapRegions();
      if (result.error) setMessage({ type: "error", text: result.error });
      else {
        setMessage({ type: "ok", text: "Régions supprimées. Relancez : node scripts/seed-map-regions.js" });
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Régions actuelles</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          {regions.length} région(s). Chaque région est associée à un ou plusieurs pays (propriété géographique).
        </p>
        <ul className="space-y-2 text-sm">
          {regions.map((r) => (
            <li key={r.id} className="rounded border py-2 px-3" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
              <span className="font-medium text-[var(--foreground)]">{r.name}</span>
              <span className="text-[var(--foreground-muted)]">
                {" "}
                — Pays : {r.country_names.length ? r.country_names.join(", ") : "aucun"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending || regions.length === 0}
          className="rounded px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          Réinitialiser la carte (supprimer toutes les régions)
        </button>
      </section>

      {message && (
        <p className="text-sm" style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
