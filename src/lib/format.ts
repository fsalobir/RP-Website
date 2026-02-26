/**
 * Formatage des nombres : séparateur de milliers = "."
 * Ex. 32000000 → "32.000.000"
 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { useGrouping: true }).replace(/\s/g, ".");
}

/**
 * PIB en milliards de dollars : ex. 1200000000 → "1,2 Bn"
 * (on garde la virgule pour les décimales en français)
 */
export function formatGdp(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  const billions = n / 1_000_000_000;
  if (billions >= 10) {
    return `${billions.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} Bn`;
  }
  return `${billions.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bn`;
}
