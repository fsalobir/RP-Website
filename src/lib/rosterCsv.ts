/**
 * CSV roster (Google Sheets) — format **long** : une ligne par couple (unité, niveau).
 *
 * Colonnes : ID_Unite, Nom, Base, Niveaux, Niveau, Manpower, Hard Power, Coût par unité, Science requise
 *
 * **Règle UX :** `Nom`, `Base` et `Niveaux` ne sont renseignés que sur la ligne où `Niveau` = 1
 * (les autres lignes ont ces cellules vides — dans Google Sheets vous pouvez griser ces colonnes manuellement).
 * À l’import, seule la ligne niveau 1 porte la vérité pour le nom, la base et le nombre de niveaux.
 *
 * Mapping DB :
 * - military_roster_units: id, name_fr, base_count, level_count
 * - military_roster_unit_levels: unit_id, level, manpower, hard_power, mobilization_cost, science_required
 */

import type { MilitaryBranch, MilitaryRosterUnit, MilitaryRosterUnitLevel } from "@/types/database";

/**
 * Même ordre que la page admin roster (`RosterEditor`) : sections Terrestre, Aérien, Naval, Stratégique,
 * puis dans chaque section par `sort_order` puis nom.
 */
export const ROSTER_DISPLAY_BRANCH_ORDER: readonly MilitaryBranch[] = [
  "terre",
  "air",
  "mer",
  "strategique",
];

function branchOrderIndex(b: MilitaryBranch): number {
  const i = ROSTER_DISPLAY_BRANCH_ORDER.indexOf(b);
  return i >= 0 ? i : ROSTER_DISPLAY_BRANCH_ORDER.length;
}

/** Tri des unités pour export CSV = ordre d’affichage du roster à l’écran. */
export function sortUnitsLikeRosterPage(units: MilitaryRosterUnit[]): MilitaryRosterUnit[] {
  return [...units].sort((a, b) => {
    const br = branchOrderIndex(a.branch) - branchOrderIndex(b.branch);
    if (br !== 0) return br;
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return a.name_fr.localeCompare(b.name_fr);
  });
}

/** Règle métier import/export : jamais plus de 7 niveaux. */
export const ROSTER_CSV_MAX_LEVELS = 7;

export const ROSTER_CSV_FIXED_COLUMN_COUNT = 9;

/** En-têtes exacts (ligne 1 du CSV exporté). */
export const ROSTER_CSV_HEADERS: readonly string[] = [
  "ID_Unite",
  "Nom",
  "Base",
  "Niveaux",
  "Niveau",
  "Manpower",
  "Hard Power",
  "Coût par unité",
  "Science requise",
] as const;

/** Une ligne du fichier (un niveau d’une unité). */
export type RosterCsvLongRow = {
  ligneFichier: number;
  id_unite: string;
  /**
   * Renseignés uniquement si `niveau === 1` ; sinon `null` (cellules vides à l’export).
   */
  nom: string | null;
  base: number | null;
  niveaux: number | null;
  /** Numéro du niveau sur cette ligne (1..7). */
  niveau: number;
  manpower: number;
  hard_power: number;
  cout_par_unite: number;
  science_requise: number;
};

/** Unité agrégée après groupement des lignes (prête pour l’import DB). */
export type RosterCsvAggregatedUnit = {
  id_unite: string;
  nom: string;
  base: number;
  niveaux: number;
  /** Clés = 1 .. niveaux */
  levelsByNumber: Map<
    number,
    {
      manpower: number;
      hard_power: number;
      cout_par_unite: number;
      science_requise: number;
    }
  >;
};

/** Ligne ignorée à l’import : « Niveau » > « Niveaux » (l’unité ne garde que les niveaux 1..Niveaux). */
export type RosterCsvIgnoredRow = {
  ligneFichier: number;
  id_unite: string;
  niveau: number;
};

export type RosterCsvParseError = {
  ligne: number;
  message: string;
};

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

/** Détecte le séparateur (virgule ou point-virgule, selon locale Sheets). */
function detectDelimiter(headerLine: string): "," | ";" {
  const comma = (headerLine.match(/,/g) ?? []).length;
  const semi = (headerLine.match(/;/g) ?? []).length;
  if (semi > comma) return ";";
  return ",";
}

/** Parse une ligne CSV simple (guillemets RFC-style). */
export function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

/** Découpe en lignes (les exports roster n’incluent pas de retour ligne dans les cellules). */
function splitCsvRows(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Échappe une cellule pour CSV (UTF-8). */
export function escapeCsvCell(value: string, delimiter: "," | ";"): string {
  const mustQuote =
    value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r");
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function parseIntegerFr(
  raw: string,
  field: string,
  ligne: number
): { ok: true; value: number } | { ok: false; error: RosterCsvParseError } {
  const t = raw.trim();
  if (t === "") {
    return { ok: false, error: { ligne, message: `« ${field} » est vide (nombre entier attendu).` } };
  }
  const normalized = t.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return { ok: false, error: { ligne, message: `« ${field} » n’est pas un nombre valide : ${raw}` } };
  }
  const int = Math.trunc(n);
  if (Math.abs(n - int) > 1e-9) {
    return { ok: false, error: { ligne, message: `« ${field} » doit être un entier : ${raw}` } };
  }
  return { ok: true, value: int };
}

function parseNonNegativeInt(
  raw: string,
  field: string,
  ligne: number
): { ok: true; value: number } | { ok: false; error: RosterCsvParseError } {
  const p = parseIntegerFr(raw, field, ligne);
  if (!p.ok) return p;
  if (p.value < 0) {
    return { ok: false, error: { ligne, message: `« ${field} » doit être ≥ 0.` } };
  }
  return p;
}

/** Métrique entière ≥ 0 : vide → défaut. */
function parseLevelMetric(
  raw: string,
  field: string,
  ligne: number,
  defaultIfEmpty: number
): { ok: true; value: number } | { ok: false; error: RosterCsvParseError } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: defaultIfEmpty };
  return parseNonNegativeInt(t, field, ligne);
}

function parseScience(
  raw: string,
  field: string,
  ligne: number
): { ok: true; value: number } | { ok: false; error: RosterCsvParseError } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: 0 };
  const normalized = t.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: { ligne, message: `« ${field} » doit être un nombre ≥ 0 : ${raw}` } };
  }
  return { ok: true, value: n };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cellTrim(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function parseLongDataRow(
  cells: string[],
  ligne: number
): { ok: true; row: RosterCsvLongRow } | { ok: false; error: RosterCsvParseError } {
  if (cells.length < ROSTER_CSV_FIXED_COLUMN_COUNT) {
    return {
      ok: false,
      error: {
        ligne,
        message: `Nombre de colonnes insuffisant (${cells.length}, attendu ${ROSTER_CSV_FIXED_COLUMN_COUNT}).`,
      },
    };
  }

  const id_unite = cellTrim(cells[0]);
  if (!UUID_RE.test(id_unite)) {
    return { ok: false, error: { ligne, message: `« ID_Unite » invalide : ${id_unite || "(vide)"}` } };
  }

  const nivLigneP = parseIntegerFr(cells[4] ?? "", "Niveau", ligne);
  if (!nivLigneP.ok) return nivLigneP;
  const niveau = nivLigneP.value;
  if (niveau < 1 || niveau > ROSTER_CSV_MAX_LEVELS) {
    return {
      ok: false,
      error: { ligne, message: `« Niveau » doit être entre 1 et ${ROSTER_CSV_MAX_LEVELS} (reçu : ${niveau}).` },
    };
  }

  const nomCell = cellTrim(cells[1]);
  const baseCell = cellTrim(cells[2]);
  const nivTotCell = cellTrim(cells[3]);

  let nom: string | null = null;
  let base: number | null = null;
  let niveaux: number | null = null;

  if (niveau === 1) {
    if (!nomCell) {
      return { ok: false, error: { ligne, message: "Sur la ligne « Niveau » = 1, « Nom » est obligatoire." } };
    }
    const baseP = parseNonNegativeInt(cells[2] ?? "", "Base", ligne);
    if (!baseP.ok) return baseP;
    const nivTotP = parseIntegerFr(cells[3] ?? "", "Niveaux", ligne);
    if (!nivTotP.ok) return nivTotP;
    if (nivTotP.value < 1 || nivTotP.value > ROSTER_CSV_MAX_LEVELS) {
      return {
        ok: false,
        error: {
          ligne,
          message: `« Niveaux » doit être entre 1 et ${ROSTER_CSV_MAX_LEVELS} (reçu : ${nivTotP.value}).`,
        },
      };
    }
    nom = nomCell;
    base = baseP.value;
    niveaux = nivTotP.value;
  } else {
    if (nomCell !== "") {
      return {
        ok: false,
        error: {
          ligne,
          message:
            "« Nom », « Base » et « Niveaux » ne doivent être remplis que sur la ligne où « Niveau » = 1 (laissez ces cellules vides pour les niveaux 2 et suivants).",
        },
      };
    }
    if (baseCell !== "") {
      return {
        ok: false,
        error: {
          ligne,
          message:
            "« Base » ne doit être remplie que sur la ligne « Niveau » = 1 (cellule vide pour les autres niveaux).",
        },
      };
    }
    if (nivTotCell !== "") {
      return {
        ok: false,
        error: {
          ligne,
          message:
            "« Niveaux » ne doit être rempli que sur la ligne « Niveau » = 1 (cellule vide pour les autres niveaux).",
        },
      };
    }
  }

  const m1 = parseLevelMetric(cells[5] ?? "", "Manpower", ligne, 0);
  if (!m1.ok) return m1;
  const m2 = parseLevelMetric(cells[6] ?? "", "Hard Power", ligne, 0);
  if (!m2.ok) return m2;
  const m3 = parseLevelMetric(cells[7] ?? "", "Coût par unité", ligne, 100);
  if (!m3.ok) return m3;
  const m4 = parseScience(cells[8] ?? "", "Science requise", ligne);
  if (!m4.ok) return m4;

  return {
    ok: true,
    row: {
      ligneFichier: ligne,
      id_unite,
      nom,
      base,
      niveaux,
      niveau,
      manpower: m1.value,
      hard_power: m2.value,
      cout_par_unite: m3.value,
      science_requise: m4.value,
    },
  };
}

/**
 * Regroupe les lignes par ID_Unite. Nom / Base / Niveaux viennent **uniquement** de la ligne « Niveau » = 1.
 * Il faut une ligne par niveau de 1 à « Niveaux ». Les lignes avec « Niveau » > « Niveaux » sont **ignorées**.
 */
export function aggregateLongRows(
  rows: RosterCsvLongRow[]
):
  | { ok: true; units: RosterCsvAggregatedUnit[]; ignoredRows: RosterCsvIgnoredRow[] }
  | { ok: false; errors: RosterCsvParseError[] } {
  const byUnit = new Map<string, RosterCsvLongRow[]>();
  for (const r of rows) {
    if (!byUnit.has(r.id_unite)) byUnit.set(r.id_unite, []);
    byUnit.get(r.id_unite)!.push(r);
  }

  const allErrors: RosterCsvParseError[] = [];
  const units: RosterCsvAggregatedUnit[] = [];
  const ignoredRows: RosterCsvIgnoredRow[] = [];

  for (const [id_unite, group] of byUnit) {
    const unitErrors: RosterCsvParseError[] = [];

    const head = group.find((r) => r.niveau === 1);
    if (!head) {
      unitErrors.push({
        ligne: 0,
        message: `ID ${id_unite} : aucune ligne avec « Niveau » = 1 (obligatoire : Nom, Base et Niveaux sur cette ligne uniquement).`,
      });
      allErrors.push(...unitErrors);
      continue;
    }

    if (head.nom == null || head.base == null || head.niveaux == null) {
      unitErrors.push({
        ligne: head.ligneFichier,
        message: `ID ${id_unite} : sur la ligne « Niveau » = 1, « Nom », « Base » et « Niveaux » sont obligatoires.`,
      });
      allErrors.push(...unitErrors);
      continue;
    }

    const nom = head.nom;
    const base = head.base;
    const niveaux = head.niveaux;

    const levelsByNumber = new Map<
      number,
      {
        manpower: number;
        hard_power: number;
        cout_par_unite: number;
        science_requise: number;
      }
    >();

    for (const r of group) {
      if (r.niveau > niveaux) {
        ignoredRows.push({ ligneFichier: r.ligneFichier, id_unite, niveau: r.niveau });
        continue;
      }
      if (r.niveau < 1) {
        unitErrors.push({
          ligne: r.ligneFichier,
          message: `ID ${id_unite} : « Niveau » invalide (${r.niveau}).`,
        });
        continue;
      }
      if (levelsByNumber.has(r.niveau)) {
        unitErrors.push({
          ligne: r.ligneFichier,
          message: `ID ${id_unite} : « Niveau » ${r.niveau} dupliqué (deux lignes pour le même niveau).`,
        });
        continue;
      }
      levelsByNumber.set(r.niveau, {
        manpower: r.manpower,
        hard_power: r.hard_power,
        cout_par_unite: r.cout_par_unite,
        science_requise: r.science_requise,
      });
    }

    for (let l = 1; l <= niveaux; l++) {
      if (!levelsByNumber.has(l)) {
        unitErrors.push({
          ligne: 0,
          message: `ID ${id_unite} : ligne manquante pour le niveau ${l} (il faut exactement une ligne par niveau de 1 à ${niveaux}).`,
        });
      }
    }

    if (unitErrors.length > 0) {
      allErrors.push(...unitErrors);
      continue;
    }

    units.push({
      id_unite,
      nom,
      base,
      niveaux,
      levelsByNumber,
    });
  }

  if (allErrors.length > 0) {
    return { ok: false, errors: allErrors };
  }

  return { ok: true, units, ignoredRows };
}

/**
 * Parse le contenu CSV (format long). Ligne 1 = en-têtes.
 */
export function parseRosterCsv(text: string):
  | {
      ok: true;
      units: RosterCsvAggregatedUnit[];
      ignoredRows: RosterCsvIgnoredRow[];
    }
  | {
      ok: false;
      errors: RosterCsvParseError[];
    } {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = splitCsvRows(raw).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { ok: false, errors: [{ ligne: 0, message: "Fichier vide." }] };
  }

  const delim = detectDelimiter(lines[0]!);
  const headerCells = parseCsvLine(lines[0]!, delim).map(normalizeHeader);

  if (headerCells.length < ROSTER_CSV_FIXED_COLUMN_COUNT) {
    return {
      ok: false,
      errors: [
        {
          ligne: 1,
          message: `En-tête : ${headerCells.length} colonnes (attendu ${ROSTER_CSV_FIXED_COLUMN_COUNT}). Séparateur : « ${delim} ».`,
        },
      ],
    };
  }

  const longRows: RosterCsvLongRow[] = [];
  const errors: RosterCsvParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cells = parseCsvLine(lines[i]!, delim);
    if (cells.every((c) => c.trim() === "")) continue;

    const parsed = parseLongDataRow(cells, lineNum);
    if (!parsed.ok) {
      errors.push(parsed.error);
      continue;
    }
    longRows.push(parsed.row);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (longRows.length === 0) {
    return { ok: false, errors: [{ ligne: 0, message: "Aucune ligne de données (seulement l’en-tête ?)." }] };
  }

  const agg = aggregateLongRows(longRows);
  if (!agg.ok) {
    return { ok: false, errors: agg.errors };
  }

  return { ok: true, units: agg.units, ignoredRows: agg.ignoredRows };
}

/** Génère le CSV UTF-8 (avec BOM) : une ligne par niveau, métriques vides (template MJ). */
export function buildRosterTemplateCsv(
  units: MilitaryRosterUnit[],
  _levels: MilitaryRosterUnitLevel[],
  delimiter: "," | ";" = ","
): string {
  const sorted = sortUnitsLikeRosterPage(units);

  const header = ROSTER_CSV_HEADERS.map((h) => escapeCsvCell(h, delimiter)).join(delimiter);
  const lines = [header];

  for (const u of sorted) {
    if (u.id.startsWith("new_")) continue;
    const L = Math.min(u.level_count, ROSTER_CSV_MAX_LEVELS);
    for (let lvl = 1; lvl <= L; lvl++) {
      const cells = [
        escapeCsvCell(u.id, delimiter),
        lvl === 1 ? escapeCsvCell(u.name_fr, delimiter) : "",
        lvl === 1 ? escapeCsvCell(String(u.base_count), delimiter) : "",
        lvl === 1 ? escapeCsvCell(String(L), delimiter) : "",
        escapeCsvCell(String(lvl), delimiter),
        "",
        "",
        "",
        "",
      ];
      lines.push(cells.join(delimiter));
    }
  }

  return "\uFEFF" + lines.join("\r\n");
}

/** Génère un CSV avec les valeurs actuelles (audit / sauvegarde). */
export function buildRosterFullCsv(
  units: MilitaryRosterUnit[],
  levels: MilitaryRosterUnitLevel[],
  delimiter: "," | ";" = ","
): string {
  const byUnit = new Map<string, Map<number, MilitaryRosterUnitLevel>>();
  for (const l of levels) {
    if (!byUnit.has(l.unit_id)) byUnit.set(l.unit_id, new Map());
    byUnit.get(l.unit_id)!.set(l.level, l);
  }

  const sorted = sortUnitsLikeRosterPage(units);

  const header = ROSTER_CSV_HEADERS.map((h) => escapeCsvCell(h, delimiter)).join(delimiter);
  const lines = [header];

  for (const u of sorted) {
    if (u.id.startsWith("new_")) continue;
    const L = Math.min(u.level_count, ROSTER_CSV_MAX_LEVELS);
    const lm = byUnit.get(u.id) ?? new Map();
    for (let lvl = 1; lvl <= L; lvl++) {
      const row = lm.get(lvl);
      const cells = [
        escapeCsvCell(u.id, delimiter),
        lvl === 1 ? escapeCsvCell(u.name_fr, delimiter) : "",
        lvl === 1 ? escapeCsvCell(String(u.base_count), delimiter) : "",
        lvl === 1 ? escapeCsvCell(String(L), delimiter) : "",
        escapeCsvCell(String(lvl), delimiter),
        row != null ? escapeCsvCell(String(row.manpower), delimiter) : "",
        row != null ? escapeCsvCell(String(row.hard_power), delimiter) : "",
        row != null ? escapeCsvCell(String(row.mobilization_cost), delimiter) : "",
        row != null ? escapeCsvCell(String(row.science_required), delimiter) : "",
      ];
      lines.push(cells.join(delimiter));
    }
  }

  return "\uFEFF" + lines.join("\r\n");
}
