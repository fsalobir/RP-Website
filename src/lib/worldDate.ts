/**
 * Date du monde (Mois Année) : stockage { month, year }, affichage en français.
 */

export const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export type WorldDateValue = { month: number; year: number };

/** Formate la date du monde pour affichage : "Janvier 2025". */
export function formatWorldDate(value: WorldDateValue | null | undefined): string {
  if (!value || typeof value.month !== "number" || typeof value.year !== "number") return "—";
  const month = Math.max(1, Math.min(12, Math.round(value.month)));
  return `${MOIS_LABELS[month - 1]} ${value.year}`;
}
