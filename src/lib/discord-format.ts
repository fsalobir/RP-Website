/**
 * Utilitaires pour le formatage des messages Discord (templates, placeholders).
 * Utilisable côté serveur (discord-dispatch) et client (preview admin).
 */

/** Remplace les placeholders {key} dans une chaîne. */
export function replacePlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Options pour personnaliser les vars de démo (date RP, action_label dérivé du type). */
export type PreviewVarsOverrides = { date?: string; action_label?: string };

/** Valeurs de démo pour l'aperçu d'un template (preview admin). */
export function getPreviewVars(overrides?: PreviewVarsOverrides): Record<string, string> {
  const date = overrides?.date ?? new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });
  return {
    country_name: "France",
    target_country_name: "Allemagne",
    action_label: overrides?.action_label ?? "Insulte diplomatique",
    date,
    resolution_date: date,
    refusal_message: "Message de refus exemple.",
    dice_success_label: "Échec",
    impact_magnitude_text: "Modéré",
    impact_value: "-25",
    impact_label: "Relations",
    impact_magnitude_bold: "**Modéré** (-25)",
  };
}
