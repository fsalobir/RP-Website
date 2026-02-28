import { createClient } from "@/lib/supabase/server";
import { getRuleLabel, BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Règles de simulation
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Paramètres utilisés par le moteur de simulation (cron) pour l’évolution des indicateurs.
      </p>

      {!rules?.length ? (
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
          className="rounded-lg border overflow-hidden"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <table className="w-full text-left text-sm">
            <thead>
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
              {rules.map((r) => {
                const isGlobalGrowth = r.key === "global_growth_effects" && Array.isArray(r.value);
                const valueCell = isGlobalGrowth ? (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {(r.value as GlobalGrowthEntry[]).map((e, i) => (
                      <li key={i}>{formatGlobalGrowthEntry(e)}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="font-mono">
                    {typeof r.value === "object"
                      ? JSON.stringify(r.value)
                      : String(r.value)}
                  </span>
                );
                return (
                  <tr
                    key={r.key}
                    className="border-b"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <td className="p-4 text-[var(--foreground)]">{getRuleLabel(r.key)}</td>
                    <td className="stat-value p-4">{valueCell}</td>
                    <td className="p-4 text-[var(--foreground-muted)]">
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
