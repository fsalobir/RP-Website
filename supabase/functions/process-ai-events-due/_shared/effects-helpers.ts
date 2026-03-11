import type { AdminEffectAdded } from "./types.ts";

export const DURATION_DAYS_MAX = 100;

const STAT_LABELS: Record<string, string> = {
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
};

function formatEffectValue(kind: string, value: number): string {
  if (
    kind.endsWith("_base") ||
    kind.endsWith("_per_stat") ||
    kind.startsWith("budget_ministry_min_pct") ||
    kind.startsWith("military_unit_limit_modifier")
  ) {
    return `${Number(value) >= 0 ? "+" : ""}${(Number(value) * 100).toFixed(2)} %`;
  }
  if (kind === "budget_allocation_cap") return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(0)} %`;
  if (kind.startsWith("influence_modifier_")) return `${(value * 100 - 100).toFixed(0)} %`;
  if (kind === "relation_delta") return `${Number(value) >= 0 ? "+" : ""}${Number(value)}`;
  if (kind.startsWith("ideology_drift_") || kind.startsWith("ideology_snap_")) {
    return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}`;
  }
  return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(0)}`;
}

export function normalizeAdminEffectsAdded(raw: unknown): AdminEffectAdded[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (e): e is AdminEffectAdded =>
        e != null &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).name === "string" &&
        typeof (e as Record<string, unknown>).effect_kind === "string"
    ) as AdminEffectAdded[];
  }
  if (
    typeof raw === "object" &&
    typeof (raw as Record<string, unknown>).name === "string" &&
    typeof (raw as Record<string, unknown>).effect_kind === "string"
  ) {
    return [raw as AdminEffectAdded];
  }
  return [];
}

export function formatAdminEffectLabel(
  effect: Pick<AdminEffectAdded, "name" | "effect_kind" | "effect_target" | "value" | "application">,
  lookups?: { rosterUnits?: { id: string; name_fr: string }[]; countries?: { id: string; name: string }[] }
): string {
  const kind = effect.effect_kind;
  const valueStr = formatEffectValue(kind, Number(effect.value));
  let targetLabel = "";
  if (effect.effect_target) {
    if (STAT_LABELS[effect.effect_target]) targetLabel = STAT_LABELS[effect.effect_target];
    else
      targetLabel =
        lookups?.rosterUnits?.find((u) => u.id === effect.effect_target)?.name_fr ??
        lookups?.countries?.find((c) => c.id === effect.effect_target)?.name ??
        effect.effect_target;
  }
  const part = targetLabel ? `${targetLabel} : ${valueStr}` : valueStr;
  const applicationLabel = effect.application === "immediate" ? "One Shot" : "Effet durable";
  return `${applicationLabel} : ${effect.name} (${part})`;
}

export function formatAdminEffectShortForDiscord(
  effect: Pick<AdminEffectAdded, "effect_kind" | "effect_target" | "value">,
  lookups?: { rosterUnits?: { id: string; name_fr: string }[] }
): string {
  const kind = effect.effect_kind;
  const value = Number(effect.value);
  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

  if (kind === "stat_delta" && effect.effect_target) {
    const statLabel = STAT_LABELS[effect.effect_target] ?? effect.effect_target;
    return `${statLabel} ${signed(Math.round(value))}`;
  }
  if ((kind === "military_unit_extra" || kind === "military_unit_tech_rate") && effect.effect_target) {
    const unitLabel = lookups?.rosterUnits?.find((u) => u.id === effect.effect_target)?.name_fr ?? effect.effect_target;
    if (kind === "military_unit_extra") return `${unitLabel} // Nombre ${signed(Math.round(value))}`;
    return `${unitLabel} // Technologie ${signed(Math.round(value))} pts/jour`;
  }
  const valueStr = formatEffectValue(kind, value);
  if (effect.effect_target) return `${effect.effect_target} : ${valueStr}`;
  return valueStr;
}
