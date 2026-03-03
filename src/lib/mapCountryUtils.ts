/**
 * Mapping statique slug → ISO2 pour la carte mondiale (react-svg-worldmap).
 * Données dérivées du seed 007 ; pays sans entrée ne s'affichent pas sur la carte.
 * Phase 2 pourra utiliser la colonne countries.iso2 si ajoutée.
 */
export const SLUG_TO_ISO2: Record<string, string> = {
  france: "fr",
  allemagne: "de",
  "royaume-uni": "gb",
  italie: "it",
  espagne: "es",
  russie: "ru",
  chine: "cn",
  japon: "jp",
  inde: "in",
  "etats-unis": "us",
  bresil: "br",
  canada: "ca",
  australie: "au",
  mexique: "mx",
  indonesie: "id",
  turquie: "tr",
  "arabie-saoudite": "sa",
  "afrique-du-sud": "za",
  nigeria: "ng",
  egypte: "eg",
  iran: "ir",
  pakistan: "pk",
  "coree-du-sud": "kr",
  pologne: "pl",
  ukraine: "ua",
  argentine: "ar",
  colombie: "co",
  thailande: "th",
  vietnam: "vn",
  "pays-bas": "nl",
  belgique: "be",
  suede: "se",
  suisse: "ch",
  norvege: "no",
  portugal: "pt",
  grece: "gr",
  "republique-tcheque": "cz",
  roumanie: "ro",
  israel: "il",
  "emirats-arabes-unis": "ae",
};

const ISO2_TO_SLUG = (() => {
  const out: Record<string, string> = {};
  for (const [slug, iso2] of Object.entries(SLUG_TO_ISO2)) {
    out[iso2] = slug;
  }
  return out;
})();

export function slugToIso2(slug: string): string | null {
  return SLUG_TO_ISO2[slug] ?? null;
}

export function iso2ToSlug(iso2: string): string | null {
  return ISO2_TO_SLUG[iso2.toLowerCase()] ?? null;
}

/** Liste des codes ISO2 connus (pays affichables sur la carte). */
export function getKnownIso2Codes(): string[] {
  return Object.values(SLUG_TO_ISO2);
}

/** ISO 3166-1 alpha-2 → id numérique (world-atlas countries-110m). Pour associer une région à un pays du TopoJSON. */
export const ISO2_TO_NUMERIC: Record<string, number> = {
  fr: 250, de: 276, gb: 826, it: 380, es: 724, ru: 643, cn: 156, jp: 392, in: 356,
  us: 840, br: 76, ca: 124, au: 36, mx: 484, id: 360, tr: 792, sa: 682, za: 710,
  ng: 566, eg: 818, ir: 364, pk: 586, kr: 410, pl: 616, ua: 804, ar: 32, co: 170,
  th: 764, vn: 704, nl: 528, be: 56, se: 752, ch: 756, no: 578, pt: 620, gr: 300,
  cz: 203, ro: 642, il: 376, ae: 784,
};
