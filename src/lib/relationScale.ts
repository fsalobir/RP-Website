/**
 * Échelle des relations diplomatiques (-100 à +100) : libellés et dégradé de couleur.
 * Rouge vif (-100) → gris (0) → vert vif (+100).
 */

const RELATION_PALIERS: { value: number; label: string }[] = [
  { value: -100, label: "Archnemesis" },
  { value: -80, label: "Haine" },
  { value: -60, label: "Hostilité" },
  { value: -40, label: "Animosité" },
  { value: -20, label: "Froideur" },
  { value: 0, label: "Indifférent" },
  { value: 20, label: "Cordial" },
  { value: 40, label: "Chaleureux" },
  { value: 60, label: "Amical" },
  { value: 80, label: "Fidèle" },
  { value: 100, label: "Dévoué" },
];

/** Retourne le libellé du palier le plus proche de value. */
export function getRelationLabel(value: number): string {
  const v = Math.max(-100, Math.min(100, Math.round(value)));
  let best = RELATION_PALIERS[0];
  let bestDist = Math.abs(RELATION_PALIERS[0].value - v);
  for (const p of RELATION_PALIERS) {
    const d = Math.abs(p.value - v);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best.label;
}

/** Gris clair pour l'indifférence (0). */
const GRAY_NEUTRAL = 200;

/** Retourne la couleur RGB pour une valeur de relation : rouge vif (-100) → gris clair (0) → vert vif (+100). */
export function getRelationColor(value: number): string {
  const v = Math.max(-100, Math.min(100, value));
  const t = (v + 100) / 200; // 0 at -100, 0.5 at 0, 1 at +100
  if (t <= 0.5) {
    // -100 → 0 : rouge très contrasté → gris clair
    const u = t * 2; // 0 → 1
    const r = Math.round(255 * (1 - u) + GRAY_NEUTRAL * u);
    const g = Math.round(40 * (1 - u) + GRAY_NEUTRAL * u);
    const b = Math.round(40 * (1 - u) + GRAY_NEUTRAL * u);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // 0 → +100 : gris clair → vert très contrasté
  const u = (t - 0.5) * 2; // 0 → 1
  const r = Math.round(GRAY_NEUTRAL * (1 - u) + 40 * u);
  const g = Math.round(GRAY_NEUTRAL * (1 - u) + 255 * u);
  const b = Math.round(GRAY_NEUTRAL * (1 - u) + 40 * u);
  return `rgb(${r}, ${g}, ${b})`;
}

export { RELATION_PALIERS };
