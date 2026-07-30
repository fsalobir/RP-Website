"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRelation, resetAllRelations, randomizeAllRelations } from "./actions";
import { RELATION_MIN, RELATION_MAX } from "@/lib/relations";

type Country = { id: string; name: string; slug: string };

function getRelationLabel(value: number): string {
  if (value <= -75) return "Hostilité extrême";
  if (value <= -25) return "Hostilité";
  if (value < 25) return "Neutre";
  if (value < 75) return "Proximité";
  return "Alliance forte";
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
    <div className="admin-settings-form space-y-4">
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Modifier une relation</h2>
        <p className="mb-3 mt-1 text-sm leading-snug text-[var(--foreground-muted)]">
          Cette valeur réciproque influence les actions, les événements IA et les idéologies. La valeur actuelle est chargée après le choix des deux pays.
        </p>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="relation-country-a" className="text-sm text-[var(--foreground-muted)]">Premier pays</label>
            <select
              id="relation-country-a"
              value={countryA}
              onChange={(e) => {
                const nextA = e.target.value;
                const nextB = nextA === countryB ? "" : countryB;
                setCountryA(nextA);
                if (nextB !== countryB) setCountryB(nextB);
                setValue(nextA && nextB ? relationMap[key(nextA, nextB)] ?? 0 : 0);
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
            <label htmlFor="relation-country-b" className="text-sm text-[var(--foreground-muted)]">Second pays</label>
            <select
              id="relation-country-b"
              value={countryB}
              onChange={(e) => {
                const nextB = e.target.value;
                const nextA = nextB === countryA ? "" : countryA;
                setCountryB(nextB);
                if (nextA !== countryA) setCountryA(nextA);
                setValue(nextA && nextB ? relationMap[key(nextA, nextB)] ?? 0 : 0);
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
            <label htmlFor="relation-range" className="text-sm text-[var(--foreground-muted)]">
              Relation : −100 hostile · 0 neutre · +100 allié
            </label>
            <div className="flex min-w-0 items-center gap-3">
              <input
                id="relation-range"
                type="range"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="min-h-11 min-w-0 flex-1 accent-[var(--accent)]"
              />
              <input
                aria-label="Valeur numérique de la relation"
                type="number"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="min-h-11 w-24 rounded-lg border bg-[var(--background)] px-2 text-center text-base text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !countryA || !countryB || countryA === countryB}
            className="min-h-11 w-full rounded-lg px-4 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {isPending ? "Enregistrement…" : "Enregistrer la relation"}
          </button>
        </div>
        {countryA && countryB && countryA !== countryB && (
          <div className="mt-3 rounded-lg bg-[var(--background-elevated)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-[var(--foreground-muted)]">
                Valeur enregistrée : <strong className="text-[var(--foreground)]">{currentValue ?? 0}</strong>
              </p>
              <p className="font-semibold text-[var(--foreground)]">
                Nouvelle lecture : {getRelationLabel(value)}
              </p>
            </div>
            <div
              aria-label={`Échelle diplomatique : ${getRelationLabel(value)}, valeur ${value}`}
              role="img"
              className="relative mt-4 h-2 rounded-full"
              style={{ background: "linear-gradient(90deg, var(--danger), var(--border-muted) 50%, var(--accent))" }}
            >
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--foreground)] bg-[var(--background)]"
                style={{ left: `${((value - RELATION_MIN) / (RELATION_MAX - RELATION_MIN)) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--foreground-muted)]">
              <span>Hostilité</span><span>Neutre</span><span>Alliance</span>
            </div>
          </div>
        )}
      </section>

      <section className="border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Actions sur toute la matrice</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
          Ces actions remplacent toutes les relations existantes. Une confirmation est demandée.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={handleResetAll}
          disabled={isPending}
          className="min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          Réinitialiser toutes les relations (0)
        </button>
        <button
          type="button"
          onClick={handleRandom}
          disabled={isPending}
          className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-[var(--background-elevated)] disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          Relations aléatoires
        </button>
        </div>
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
