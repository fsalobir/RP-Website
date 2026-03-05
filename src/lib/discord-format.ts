/**
 * Utilitaires pour le formatage des messages Discord (templates, placeholders).
 * Utilisable côté serveur (discord-dispatch) et client (preview admin).
 */

/** Remplace les placeholders {key} dans une chaîne. */
export function replacePlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Options pour personnaliser les vars de démo (date RP, action_label, type d’action, up_kind, dice_result pour demande_up). */
export type PreviewVarsOverrides = {
  date?: string;
  action_label?: string;
  type_key?: string;
  up_kind?: string | null;
  dice_result?: "success" | "failure" | null;
};

/** Chaînes de démo pour up_summary par up_kind (alignées sur formatAdminEffectShortForDiscord). Tirer une au hasard pour varier l’aperçu. */
const DEMO_UP_SUMMARY_BY_KIND: Record<string, string[]> = {
  stat: ["Militarisme +1", "Stabilité +1", "Science +1", "Population +1", "Industrie +1"],
  tech: [
    "Char // Technologie +50 pts/jour",
    "Drone MALE // Technologie +100 pts/jour",
    "Navire // Technologie +30 pts/jour",
  ],
  nombre: [
    "Char // Nombre +50",
    "Navire // Nombre +20",
    "Véhicule Anti-Aérien // Nombre +1",
  ],
  mixed: [
    "Science +1, Char // Nombre +10",
    "Stabilité +1, Navire // Nombre +5",
  ],
  null: ["Science +1", "Militarisme +1", "Char // Nombre +20"],
};

function pickDemoUpSummary(upKind: string | null): string {
  const key = upKind != null && upKind !== "" ? upKind : "null";
  const list = DEMO_UP_SUMMARY_BY_KIND[key] ?? DEMO_UP_SUMMARY_BY_KIND.null;
  return list[Math.floor(Math.random() * list.length)] ?? "Science +1";
}

/** Valeurs de démo pour l'aperçu d'un template (preview admin). Pour demande_up : pas de cible ; en échec up_summary = "Aucun effet", en succès cohérent avec up_kind. */
export function getPreviewVars(overrides?: PreviewVarsOverrides): Record<string, string> {
  const date = overrides?.date ?? new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });
  const isDemandeUp = overrides?.type_key?.startsWith("demande_up") ?? false;
  let upSummary = "";
  if (isDemandeUp) {
    if (overrides?.dice_result === "failure") {
      upSummary = "Aucun effet";
    } else if (overrides?.up_kind !== undefined) {
      upSummary = pickDemoUpSummary(overrides.up_kind);
    } else {
      upSummary = "Science +1";
    }
  }
  return {
    country_name: "France",
    target_country_name: isDemandeUp ? "" : "Allemagne",
    action_label: overrides?.action_label ?? "Insulte diplomatique",
    date,
    resolution_date: date,
    refusal_message: "Message de refus exemple.",
    dice_success_label: "Échec",
    impact_magnitude_text: "Modéré",
    impact_value: "-25",
    impact_label: "Relations",
    impact_magnitude_bold: "**Modéré** (-25)",
    up_summary: upSummary,
  };
}
