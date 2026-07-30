"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRelation, resetAllRelations, randomizeAllRelations } from "./actions";
import { RELATION_MIN, RELATION_MAX } from "@/lib/relations";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

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
  const [countryAQuery, setCountryAQuery] = useState("");
  const [countryBQuery, setCountryBQuery] = useState("");
  const [value, setValue] = useState(0);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [globalAction, setGlobalAction] = useState<"random" | "reset" | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const key = (a: string, b: string) => {
    if (!a || !b || a === b) return "";
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };

  const currentValue =
    countryA && countryB && countryA !== countryB ? relationMap[key(countryA, countryB)] ?? 0 : null;
  const countryAName = countries.find((country) => country.id === countryA)?.name;
  const countryBName = countries.find((country) => country.id === countryB)?.name;
  const pairReady = currentValue !== null;
  const relationDelta = pairReady ? value - currentValue : 0;

  if (countries.length < 2) {
    return (
      <p className="rounded-lg border p-4 text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
        Ajoutez au moins deux pays avant de définir leurs relations.
      </p>
    );
  }

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
      <section aria-labelledby="bilateral-relation-title" className="border-y py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="bilateral-relation-title" className="text-base font-semibold text-[var(--foreground)]">
            Relation bilatérale
          </h2>
          <span className="text-xs text-[var(--foreground-muted)]">{countries.length} pays disponibles</span>
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <label htmlFor="relation-country-a" className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-[var(--foreground-muted)]">Premier pays</span>
            <input
              id="relation-country-a"
              type="search"
              list="relation-country-a-options"
              autoComplete="off"
              placeholder="Rechercher un pays…"
              value={countryAQuery}
              onChange={(event) => {
                const query = event.target.value;
                const nextA = countries.find((country) => country.name === query)?.id ?? "";
                const nextB = nextA === countryB ? "" : countryB;
                setCountryAQuery(query);
                setCountryA(nextA);
                if (nextB !== countryB) {
                  setCountryB(nextB);
                  setCountryBQuery("");
                }
                setValue(nextA && nextB ? relationMap[key(nextA, nextB)] ?? 0 : 0);
              }}
              className="min-h-11 w-full min-w-0 rounded-lg border bg-[var(--background)] px-3 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <datalist id="relation-country-a-options">
              {countries.map((country) => (
                <option key={country.id} value={country.name} />
              ))}
            </datalist>
          </label>

          <span aria-hidden className="hidden pb-3 text-lg text-[var(--foreground-muted)] sm:block">↔</span>

          <label htmlFor="relation-country-b" className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-[var(--foreground-muted)]">Second pays</span>
            <input
              id="relation-country-b"
              type="search"
              list="relation-country-b-options"
              autoComplete="off"
              placeholder="Rechercher un pays…"
              value={countryBQuery}
              onChange={(event) => {
                const query = event.target.value;
                const nextB = countries.find((country) => country.name === query)?.id ?? "";
                const nextA = nextB === countryA ? "" : countryA;
                setCountryBQuery(query);
                setCountryB(nextB);
                if (nextA !== countryA) {
                  setCountryA(nextA);
                  setCountryAQuery("");
                }
                setValue(nextA && nextB ? relationMap[key(nextA, nextB)] ?? 0 : 0);
              }}
              className="min-h-11 w-full min-w-0 rounded-lg border bg-[var(--background)] px-3 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <datalist id="relation-country-b-options">
              {countries.map((country) => (
                <option key={country.id} value={country.name} />
              ))}
            </datalist>
          </label>
        </div>

        {pairReady ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0">
              <div className="flex items-end justify-between gap-3">
                <label htmlFor="relation-range" className="text-sm font-medium text-[var(--foreground)]">
                  Position diplomatique
                </label>
                <input
                  aria-label="Valeur numérique de la relation"
                  type="number"
                  min={RELATION_MIN}
                  max={RELATION_MAX}
                  value={value}
                  onChange={(event) => setValue(Number(event.target.value))}
                  className="min-h-10 w-20 rounded-lg border bg-[var(--background)] px-2 text-center text-base font-semibold text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <input
                id="relation-range"
                type="range"
                min={RELATION_MIN}
                max={RELATION_MAX}
                value={value}
                onChange={(event) => setValue(Number(event.target.value))}
                className="mt-2 min-h-11 w-full accent-[var(--accent)]"
              />
              <div
                aria-label={`Échelle diplomatique : ${getRelationLabel(value)}, valeur ${value}`}
                role="img"
                className="relative mt-1 h-2 rounded-full"
                style={{ background: "linear-gradient(90deg, var(--danger), var(--border-muted) 50%, var(--accent))" }}
              >
                <span
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--foreground)] bg-[var(--background)]"
                  style={{ left: `${((value - RELATION_MIN) / (RELATION_MAX - RELATION_MIN)) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--foreground-muted)]">
                <span>−100 Hostilité</span><span>0 Neutre</span><span>+100 Alliance</span>
              </div>
            </div>

            <aside className="flex flex-col justify-between rounded-xl bg-[var(--background-elevated)] p-3">
              <div>
                <p className="truncate text-xs text-[var(--foreground-muted)]">{countryAName} ↔ {countryBName}</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{getRelationLabel(value)}</p>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                  {currentValue} <span aria-hidden>→</span> <strong className="text-[var(--foreground)]">{value}</strong>
                  {relationDelta !== 0 ? (
                    <span className="ml-2 text-[var(--accent)]">({relationDelta > 0 ? "+" : ""}{relationDelta})</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || value === currentValue}
                className="mt-4 min-h-11 w-full rounded-lg px-4 text-sm font-semibold text-[#0f1419] disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                {isPending ? "Enregistrement…" : value === currentValue ? "Relation à jour" : "Enregistrer"}
              </button>
            </aside>
          </div>
        ) : null}
      </section>

      <details className="rounded-xl border px-3" style={{ borderColor: "var(--border-muted)" }}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
          Actions globales
          <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
        </summary>
        <div className="border-t py-3" style={{ borderColor: "var(--border-muted)" }}>
          <p className="text-xs text-[var(--foreground-muted)]">Ces actions remplacent toute la matrice.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => setGlobalAction("random")}
              disabled={isPending}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              Générer des relations aléatoires
            </button>
            <button
              type="button"
              onClick={() => setGlobalAction("reset")}
              disabled={isPending}
              className="min-h-11 rounded-lg px-4 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
            >
              Tout remettre à 0
            </button>
          </div>
        </div>
      </details>

      {message ? (
        <p role={message.type === "error" ? "alert" : "status"} className="text-sm" style={{ color: message.type === "error" ? "var(--danger)" : "var(--accent)" }}>
          {message.text}
        </p>
      ) : null}

      <AdminConfirmDialog
        open={globalAction !== null}
        onClose={() => setGlobalAction(null)}
        title={globalAction === "reset" ? "Remettre toutes les relations à zéro ?" : "Générer une nouvelle matrice ?"}
        consequence={
          globalAction === "reset"
            ? "Toutes les relations bilatérales deviendront neutres. Cette opération remplace la matrice actuelle."
            : "Chaque paire de pays recevra une nouvelle relation entre −100 et +100. La matrice actuelle sera entièrement remplacée."
        }
        confirmLabel={globalAction === "reset" ? "Tout remettre à zéro" : "Générer la matrice"}
        danger={globalAction === "reset"}
        busy={isPending}
        onConfirm={() => {
          if (globalAction === "reset") handleResetAll();
          else if (globalAction === "random") handleRandom();
        }}
      />
    </div>
  );
}
