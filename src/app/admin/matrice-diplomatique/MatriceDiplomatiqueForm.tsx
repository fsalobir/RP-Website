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
      <section className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]">
          <span>Modifier une relation</span>
          <InfoTooltip content={<TooltipBody text="Permet de fixer la relation diplomatique entre deux pays. Cette valeur est utilisée par plusieurs systèmes, notamment l'idéologie et certains événements." />} side="bottom" />
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <span>Pays A</span>
              <InfoTooltip content={<TooltipBody text="Premier pays de la relation bilatérale à modifier." />} />
            </label>
            <select
              value={countryA}
              onChange={(e) => {
                setCountryA(e.target.value);
                if (e.target.value === countryB) setCountryB("");
              }}
              className="rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
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
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <span>Pays B</span>
              <InfoTooltip content={<TooltipBody text="Second pays de la relation bilatérale à modifier. Il doit être différent du premier." />} />
            </label>
            <select
              value={countryB}
              onChange={(e) => {
                setCountryB(e.target.value);
                if (e.target.value === countryA) setCountryA("");
              }}
              className="rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
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
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
              <span>Relation ({RELATION_MIN} à {RELATION_MAX})</span>
              <InfoTooltip content={<TooltipBody text="Mesure la qualité du lien diplomatique entre les deux pays : négative en cas d'hostilité, positive en cas de proximité." />} />
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-40"
              />
              <input
                type="number"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-16 rounded border bg-[var(--background)] px-2 py-1 text-center text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !countryA || !countryB || countryA === countryB}
            className="rounded px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
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

      <section className="flex flex-wrap gap-3">
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
          className="text-sm"
          style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
