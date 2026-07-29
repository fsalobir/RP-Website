"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRelation, resetAllRelations, randomizeAllRelations } from "./actions";
import { RELATION_MIN, RELATION_MAX } from "@/lib/relations";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

type Country = { id: string; name: string; slug: string };

function TooltipBody({ text }: { text: string }) {
  return <div className="text-xs leading-snug">{text}</div>;
}

export function MatriceDiplomatiqueForm({
  countries,
  relationMap,
}: {
  countries: Country[];
  relationMap: Record<string, number>;
}) {
  const [countryA, setCountryA] = useState<string>("");
  const [countryB, setCountryB] = useState<string>("");
  const [value, setValue] = useState(0);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const key = (a: string, b: string) => {
    if (!a || !b || a === b) return "";
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };

  const currentValue =
    countryA && countryB && countryA !== countryB ? relationMap[key(countryA, countryB)] ?? 0 : null;

  const handleSave = () => {
    if (!countryA || !countryB || countryA === countryB) {
      setMessage({ type: "error", text: "Choisissez deux pays différents." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await setRelation(countryA, countryB, value);
      if (result.error) setMessage({ type: "error", text: result.error });
      else {
        setMessage({ type: "ok", text: "Relation enregistrée." });
        router.refresh();
      }
    });
  };

  const handleResetAll = () => {
    if (!window.confirm("Réinitialiser toutes les relations à 0 ?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resetAllRelations();
      if (result.error) setMessage({ type: "error", text: result.error });
      else {
        setMessage({ type: "ok", text: "Toutes les relations ont été réinitialisées." });
        setValue(0);
        window.location.reload();
      }
    });
  };

  const handleRandom = () => {
    if (!window.confirm("Attribuer une valeur aléatoire (-100 à +100) à toutes les paires de pays ?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await randomizeAllRelations();
      if (result.error) setMessage({ type: "error", text: result.error });
      else {
        setMessage({ type: "ok", text: "Relations aléatoires appliquées." });
        window.location.reload();
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border p-4 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]">
          <span>Modifier une relation</span>
          <InfoTooltip content={<TooltipBody text="Valeur de la relation entre deux pays. Utilisée par les events IA et l'idéologie." />} side="bottom" />
        </h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <label htmlFor="relation-country-a">Pays A</label>
              <InfoTooltip content={<TooltipBody text="Premier pays de la relation bilatérale à modifier." />} />
            </div>
            <select
              id="relation-country-a"
              value={countryA}
              onChange={(e) => {
                setCountryA(e.target.value);
                if (e.target.value === countryB) setCountryB("");
              }}
              className="w-full min-w-0 rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">— Choisir —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <label htmlFor="relation-country-b">Pays B</label>
              <InfoTooltip content={<TooltipBody text="Second pays de la paire (doit être différent du premier)." />} />
            </div>
            <select
              id="relation-country-b"
              value={countryB}
              onChange={(e) => {
                setCountryB(e.target.value);
                if (e.target.value === countryA) setCountryA("");
              }}
              className="w-full min-w-0 rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">— Choisir —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === countryA}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <label htmlFor="relation-range">Relation ({RELATION_MIN} à {RELATION_MAX})</label>
              <InfoTooltip content={<TooltipBody text="Qualité du lien : négatif = hostilité, positif = proximité. Utilisé par les events IA et l'idéologie." />} />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <input
                id="relation-range"
                type="range"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="min-w-0 flex-1"
              />
              <input
                aria-label="Valeur numérique de la relation"
                type="number"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-20 rounded border bg-[var(--background)] px-2 py-2 text-center text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !countryA || !countryB || countryA === countryB}
            className="w-full rounded px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Enregistrer
          </button>
        </div>
        {countryA && countryB && countryA !== countryB && (
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">
            Relation actuelle : <strong className="text-[var(--foreground)]">{currentValue ?? 0}</strong>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={handleResetAll}
          disabled={isPending}
          className="rounded px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          Réinitialiser toutes les relations (0)
        </button>
        <button
          type="button"
          onClick={handleRandom}
          disabled={isPending}
          className="rounded border px-4 py-2 text-sm font-medium opacity-90 hover:opacity-100 disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          Relations aléatoires
        </button>
      </section>

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className="text-sm"
          style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
