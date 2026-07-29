import { createClient } from "@/lib/supabase/server";
import { getRuleLabel, BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import { formatWorldDate } from "@/lib/worldDate";
import {
  EFFECT_KIND_LABELS,
  STAT_LABELS,
  MILITARY_BRANCH_EFFECT_LABELS,
  formatEffectValue,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
} from "@/lib/countryEffects";

type GlobalGrowthEntry = { effect_kind: string; effect_target: string | null; value: number };

const HIDDEN_PUBLIC_RULE_KEYS = new Set([
  "ai_events_config",
  "ai_events_cron_last_check",
  "ai_events_last_run",
  "process_due_edge_secret",
]);

function formatGlobalGrowthEntry(e: GlobalGrowthEntry): string {
  const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
  let targetLabel: string | null = null;
  if (e.effect_target) {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind))
      targetLabel = STAT_LABELS[e.effect_target as keyof typeof STAT_LABELS] ?? e.effect_target;
    else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind))
      targetLabel = BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target;
    else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind))
      targetLabel = MILITARY_BRANCH_EFFECT_LABELS[e.effect_target] ?? e.effect_target;
    else targetLabel = e.effect_target;
  }
  const valueStr = formatEffectValue(e.effect_kind, Number(e.value));
  return targetLabel ? `${kindLabel} — ${targetLabel} : ${valueStr}` : `${kindLabel} : ${valueStr}`;
}

export default async function ReglesPage() {
  const supabase = await createClient();
  const { data: rules, error } = await supabase
    .from("rule_parameters")
    .select("key, value, description")
    .order("key");

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--danger)]">Erreur lors du chargement des règles.</p>
      </div>
    );
  }

  const visibleRules = rules?.filter((rule) => !HIDDEN_PUBLIC_RULE_KEYS.has(rule.key));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Règles de simulation
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Paramètres qui régissent l’évolution du monde.
      </p>

      <section className="mb-10 rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">Matrice diplomatique</h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          Les relations bilatérales entre pays sont définies par une seule valeur par paire, de −100 (haine féroce) à +100 (loyauté absolue). Cette matrice alimente les modificateurs de jets (succès, impact), les effets d&apos;ouverture ou d&apos;insulte diplomatique et l&apos;affichage des relations sur la fiche pays et sur la carte.
        </p>
      </section>

      {!visibleRules?.length ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre défini.</p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg border"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <table className="w-full text-left text-sm">
            <thead className="hidden md:table-header-group">
              <tr
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Paramètre
                </th>
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Valeur
                </th>
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRules.map((r) => {
                const isGlobalGrowth = r.key === "global_growth_effects" && Array.isArray(r.value);
                const isWorldDate = r.key === "world_date" && typeof r.value === "object" && r.value !== null && "month" in r.value && "year" in r.value;
                const isWorldDateAdvance = r.key === "world_date_advance_months";
                const valueCell = isGlobalGrowth ? (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {(r.value as GlobalGrowthEntry[]).map((e, i) => (
                      <li key={i}>{formatGlobalGrowthEntry(e)}</li>
                    ))}
                  </ul>
                ) : isWorldDate ? (
                  <span>{formatWorldDate(r.value as { month: number; year: number })}</span>
                ) : isWorldDateAdvance ? (
                  <span>{typeof r.value === "number" ? r.value : Number(r.value) ?? "—"} mois</span>
                ) : (
                  <span className="font-mono [overflow-wrap:anywhere]">
                    {typeof r.value === "object"
                      ? JSON.stringify(r.value, null, 2)
                      : String(r.value)}
                  </span>
                );
                return (
                  <tr
                    key={r.key}
                    className="block border-b p-4 md:table-row md:p-0"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <td className="block pb-3 font-semibold text-[var(--foreground)] md:table-cell md:p-4 md:font-normal">
                      {getRuleLabel(r.key)}
                    </td>
                    <td className="stat-value block min-w-0 pb-3 md:table-cell md:p-4">
                      <span className="mb-1 block text-xs font-medium text-[var(--foreground-muted)] md:hidden">Valeur</span>
                      <div className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {valueCell}
                      </div>
                    </td>
                    <td className="block text-[var(--foreground-muted)] md:table-cell md:p-4">
                      <span className="mb-1 block text-xs font-medium md:hidden">Description</span>
                      {r.description ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
