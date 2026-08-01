import type {
  ArticleProfile,
  D100Outcome,
  LoreArticle,
  MagnumArticleOutput,
} from "@/types/rpPipeline";

export const MAGNUM_MODEL = "anthracite-org-magnum-v4-72b-FP8-Dynamic";
export const MAGNUM_CONTEXT_LIMIT = 24_000;

export const ARTICLE_PROFILE_LIMITS: Record<ArticleProfile, { min: number; max: number }> = {
  brief: { min: 250, max: 650 },
  standard: { min: 450, max: 1_200 },
  dossier: { min: 2_000, max: 3_500 },
};

export function getD100Outcome(total: number): D100Outcome {
  if (!Number.isInteger(total) || total < 1 || total > 100) {
    throw new RangeError("Le résultat D100 doit être un entier compris entre 1 et 100.");
  }
  if (total === 1) return "critical_failure";
  if (total <= 24) return "major_failure";
  if (total <= 49) return "minor_failure";
  if (total <= 74) return "minor_success";
  if (total <= 99) return "major_success";
  return "critical_success";
}

export interface RoleplayDateAnchor {
  real_timestamp: string;
  roleplay_month: number;
  roleplay_year: number;
}

export interface EstimatedRoleplayDate {
  year: number;
  month: number;
  day: number;
  week: number;
  iso: string;
}

const DAY_MS = 86_400_000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addRoleplayDays(year: number, month: number, offset: number): EstimatedRoleplayDate {
  let currentYear = year;
  let currentMonth = month;
  let remaining = Math.max(0, Math.floor(offset));
  while (remaining >= daysInMonth(currentYear, currentMonth)) {
    remaining -= daysInMonth(currentYear, currentMonth);
    currentMonth++;
    if (currentMonth === 13) {
      currentMonth = 1;
      currentYear++;
    }
  }
  const day = remaining + 1;
  return {
    year: currentYear,
    month: currentMonth,
    day,
    week: Math.ceil(day / 7),
    iso: `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function roleplayDaysBetween(a: RoleplayDateAnchor, b: RoleplayDateAnchor): number {
  let year = a.roleplay_year;
  let month = a.roleplay_month;
  let total = 0;
  const end = b.roleplay_year * 12 + b.roleplay_month;
  while (year * 12 + month < end) {
    total += daysInMonth(year, month);
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  return total;
}

export function estimateRoleplayDate(params: {
  anchors: RoleplayDateAnchor[];
  at: string | Date;
  cadenceDaysPerMonth: number;
  paused?: boolean;
}): EstimatedRoleplayDate | null {
  const anchors = [...params.anchors]
    .filter(
      (anchor) =>
        Number.isFinite(Date.parse(anchor.real_timestamp)) &&
        Number.isInteger(anchor.roleplay_month) &&
        anchor.roleplay_month >= 1 &&
        anchor.roleplay_month <= 12 &&
        Number.isInteger(anchor.roleplay_year),
    )
    .sort((a, b) => Date.parse(a.real_timestamp) - Date.parse(b.real_timestamp));
  if (anchors.length === 0) return null;

  const atMs = params.at instanceof Date ? params.at.getTime() : Date.parse(params.at);
  if (!Number.isFinite(atMs)) throw new RangeError("Horodatage réel invalide.");
  const first = anchors[0];
  if (atMs <= Date.parse(first.real_timestamp)) {
    return addRoleplayDays(first.roleplay_year, first.roleplay_month, 0);
  }

  const previousIndex = anchors.findLastIndex((anchor) => Date.parse(anchor.real_timestamp) <= atMs);
  const previous = anchors[Math.max(0, previousIndex)];
  const next = anchors[previousIndex + 1];
  if (next) {
    const startMs = Date.parse(previous.real_timestamp);
    const spanMs = Date.parse(next.real_timestamp) - startMs;
    const fraction = spanMs > 0 ? Math.min(1, (atMs - startMs) / spanMs) : 0;
    return addRoleplayDays(
      previous.roleplay_year,
      previous.roleplay_month,
      Math.floor(roleplayDaysBetween(previous, next) * fraction),
    );
  }

  if (params.paused) return addRoleplayDays(previous.roleplay_year, previous.roleplay_month, 0);
  if (!Number.isFinite(params.cadenceDaysPerMonth) || params.cadenceDaysPerMonth <= 0) {
    throw new RangeError("La cadence doit être un nombre de jours strictement positif.");
  }
  const elapsedMonths = (atMs - Date.parse(previous.real_timestamp)) / (params.cadenceDaysPerMonth * DAY_MS);
  const wholeMonths = Math.floor(elapsedMonths);
  const base = addRoleplayDays(
    previous.roleplay_year,
    previous.roleplay_month,
    roleplayDaysBetween(previous, {
      real_timestamp: previous.real_timestamp,
      roleplay_month: ((previous.roleplay_month - 1 + wholeMonths) % 12) + 1,
      roleplay_year: previous.roleplay_year + Math.floor((previous.roleplay_month - 1 + wholeMonths) / 12),
    }),
  );
  return addRoleplayDays(
    base.year,
    base.month,
    Math.floor((elapsedMonths - wholeMonths) * daysInMonth(base.year, base.month)),
  );
}

const AUTHORITY_SCORE: Record<LoreArticle["source_kind"], number> = {
  engine: 4,
  mj: 4,
  official: 3,
  player: 2,
  unclassified: 0,
};

export interface LoreContextQuery {
  countryIds?: string[];
  targetCountryIds?: string[];
  regionIds?: string[];
  tags?: string[];
  roleplayDate?: string;
  preferredAgeMonths?: number;
  maxArticles?: number;
  maxTokens?: number;
}

function monthDistance(a: string, b: string): number {
  const left = /^(\d{4})-(\d{2})/.exec(a);
  const right = /^(\d{4})-(\d{2})/.exec(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs((Number(left[1]) - Number(right[1])) * 12 + Number(left[2]) - Number(right[2]));
}

function intersects(left: string[], right: string[]): boolean {
  const wanted = new Set(right);
  return left.some((value) => wanted.has(value));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function selectLoreContext(
  articles: LoreArticle[],
  query: LoreContextQuery,
): { articles: LoreArticle[]; estimatedTokens: number } {
  const countryIds = query.countryIds ?? [];
  const targetCountryIds = query.targetCountryIds ?? [];
  const regionIds = query.regionIds ?? [];
  const tags = query.tags ?? [];
  const preferredAge = query.preferredAgeMonths ?? 12;
  const maxArticles = query.maxArticles ?? 8;
  const maxTokens = Math.min(query.maxTokens ?? MAGNUM_CONTEXT_LIMIT, MAGNUM_CONTEXT_LIMIT);

  const hasFilters = Boolean(countryIds.length || targetCountryIds.length || regionIds.length || tags.length);
  const scored = articles
    .filter(
      (article) =>
        !article.deleted_at &&
        !article.nsfw_quarantined &&
        article.source_kind !== "unclassified" &&
        (article.editorial_status === "approved" || article.editorial_status === "published") &&
        (article.source_kind !== "engine" || article.editorial_status === "published"),
    )
    .map((article) => {
      const allCountries = [
        ...article.countries.map(({ country_id }) => country_id),
      ];
      const wantedCountries = new Set([...countryIds, ...targetCountryIds]);
      const relevance =
        [...new Set(allCountries)].filter((id) => wantedCountries.has(id))
            .length *
          100 +
        (intersects(
          article.countries
            .map(({ continent_id }) => continent_id)
            .filter((continentId): continentId is string => typeof continentId === "string"),
          regionIds,
        )
          ? 4
          : 0) +
        (intersects(article.tags, tags) ? 6 : 0);
      const age =
        query.roleplayDate && article.rp_year && article.rp_month
          ? monthDistance(query.roleplayDate, `${article.rp_year}-${String(article.rp_month).padStart(2, "0")}`)
          : Number.POSITIVE_INFINITY;
      return { article, relevance, age, authority: AUTHORITY_SCORE[article.source_kind] };
    });
  // ponytail: seuil relatif simple; passer aux embeddings seulement si le rappel mesuré devient insuffisant.
  const relevanceFloor = hasFilters
    ? Math.max(
        1,
        Math.ceil(
          scored.reduce((maximum, { relevance }) => Math.max(maximum, relevance), 0) * 0.6,
        ),
      )
    : 0;
  const ranked = scored
    .filter(({ relevance }) => relevance >= relevanceFloor)
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.authority - a.authority ||
        Number(a.age > preferredAge) - Number(b.age > preferredAge) ||
        a.age - b.age ||
        Date.parse(b.article.real_published_at ?? "") - Date.parse(a.article.real_published_at ?? ""),
    );

  const selected: LoreArticle[] = [];
  let estimatedTokens = 0;
  for (const { article } of ranked) {
    if (selected.length >= maxArticles) break;
    const tokens = estimateTokens(`${article.title ?? ""}\n${article.clean_content}`);
    if (estimatedTokens + tokens > maxTokens) continue;
    selected.push(article);
    estimatedTokens += tokens;
  }
  return { articles: selected, estimatedTokens };
}

const UNSAFE_MARKDOWN = /@everyone|@here|<@!?&?\d+>|<#\d+>|```/i;
const FORBIDDEN_IDENTIFIER = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b\d{15,20}\b/i;
const FORBIDDEN_MECHANICS =
  /(?:^|[^\p{L}\p{N}_])(?:d100|jet de (?:dé|dés)|modificateur|execution_version|consequence_plan|base de données|moteur de jeu|succès (?:mineur|majeur|critique)|échec (?:mineur|majeur|critique))(?=$|[^\p{L}\p{N}_])/iu;
const NSFW_WORDS =
  /\b(?:porn(?:ographie|ographique|graphic)?s?|hentai|sex(?:e|es|uel(?:le)?s?|ual(?:ity)?)?|erot\w*|orgasm\w*|genital\w*|penis|vagin\w*|masturb\w*|prostitut\w*|rape|raped|viols?|inceste|pedophil(?:e|ie)|nudites?|nudes?|explicit(?:e|es)?|nsfw)\b/i;

export function containsNsfwContent(value: string): boolean {
  return NSFW_WORDS.test(
    value.normalize("NFKD").replace(/\p{Diacritic}/gu, ""),
  );
}

export interface MagnumValidationOptions {
  profile: ArticleProfile;
  allowedCountries?: string[];
  knownCountries?: string[];
  allowedNumbers?: Array<string | number>;
  allowedDates?: string[];
}

function textMentionsCountry(text: string, country: string): boolean {
  const escaped = country.toLocaleLowerCase("fr").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u").test(text.toLocaleLowerCase("fr"));
}

export function countriesMentionedInFacts(value: unknown, knownCountries: string[]): string[] {
  const corpus = JSON.stringify(value);
  return knownCountries.filter((country) => textMentionsCountry(corpus, country));
}

function normalizeNumberToken(value: string | number): string {
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalized;
}

const TECHNICAL_NUMBER_KEY =
  /(?:^id$|_id$|_ids$|discord|version|_at$|^jet$|dice|selection|preconditions|params|cooldown|weight|relation_at_selection|photographie_initiale_du_monde|stability|militarism|industry|science|^ideology_)/i;

export function collectFactualNumbers(
  value: unknown,
  output = new Set<string>(),
  key = "",
): Set<string> {
  if (TECHNICAL_NUMBER_KEY.test(key)) return output;
  if (typeof value === "number" && Number.isFinite(value)) {
    output.add(normalizeNumberToken(value));
  } else if (typeof value === "string") {
    const cleaned = value
      .replace(/https?:\/\/[^\s<>]+/gi, "")
      .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, "")
      .replace(/<?[@#&]?\d{15,20}>?/g, "");
    for (const [number] of cleaned.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
      output.add(normalizeNumberToken(number));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectFactualNumbers(item, output, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) {
      collectFactualNumbers(item, output, childKey);
    }
  }
  return output;
}

export function parseAndValidateMagnumOutput(
  raw: string,
  options: MagnumValidationOptions,
): { output?: MagnumArticleOutput; errors: string[] } {
  const errors: string[] = [];
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return { errors: ["JSON invalide."] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: ["Objet JSON attendu."] };
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["title", "description", "sections"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    errors.push("La sortie contient des champs interdits.");
  }
  if (typeof record.title !== "string" || !record.title.trim()) errors.push("Titre manquant.");
  if (typeof record.description !== "string" || !record.description.trim()) errors.push("Description manquante.");

  let sections: MagnumArticleOutput["sections"];
  if (record.sections !== undefined) {
    if (
      !Array.isArray(record.sections) ||
      record.sections.some(
        (section) =>
          !section ||
          typeof section !== "object" ||
          Array.isArray(section) ||
          typeof (section as Record<string, unknown>).title !== "string" ||
          typeof (section as Record<string, unknown>).body !== "string" ||
          Object.keys(section as Record<string, unknown>).some((key) => key !== "title" && key !== "body"),
      )
    ) {
      errors.push("Sections invalides.");
    } else {
      sections = record.sections.map((section) => ({
        title: String((section as Record<string, unknown>).title).trim(),
        body: String((section as Record<string, unknown>).body).trim(),
      }));
    }
  }

  const output: MagnumArticleOutput = {
    title: typeof record.title === "string" ? record.title.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
    ...(sections?.length ? { sections } : {}),
  };
  if (output.title.length > 256) errors.push("Titre trop long pour Discord.");
  if (output.description.length > 4_096) errors.push("Description trop longue pour Discord.");
  if ((output.sections?.length ?? 0) > 25) errors.push("Trop de sections pour Discord.");
  if (output.sections?.some((section) => section.title.length > 256 || section.body.length > 1_024)) {
    errors.push("Une section dépasse les limites Discord.");
  }
  const fullText = [
    output.title,
    output.description,
    ...(output.sections ?? []).flatMap((section) => [section.title, section.body]),
  ].join("\n");
  const articleLength = [output.description, ...(output.sections ?? []).map((section) => section.body)].join("\n").length;
  const limits = ARTICLE_PROFILE_LIMITS[options.profile];
  if (articleLength < limits.min || articleLength > limits.max) {
    errors.push(`Longueur hors profil (${limits.min}–${limits.max} caractères).`);
  }
  if (containsNsfwContent(fullText)) errors.push("Contenu NSFW détecté.");
  if (UNSAFE_MARKDOWN.test(fullText)) errors.push("Markdown ou mention Discord interdite.");
  if (FORBIDDEN_IDENTIFIER.test(fullText)) errors.push("Identifiant interne interdit.");
  if (FORBIDDEN_MECHANICS.test(fullText)) errors.push("Fait mécanique interdit.");
  if (
    options.allowedCountries?.length &&
    !options.allowedCountries.some((country) => textMentionsCountry(fullText, country))
  ) {
    errors.push("Aucun pays autorisé n'est mentionné.");
  }
  const forbiddenKnownCountries = (options.knownCountries ?? options.allowedCountries ?? []).filter(
    (country) =>
      textMentionsCountry(fullText, country) &&
      !(options.allowedCountries ?? []).some(
        (allowed) => allowed.localeCompare(country, "fr", { sensitivity: "base" }) === 0,
      ),
  );
  if (forbiddenKnownCountries.length) {
    errors.push(`Pays absents des faits : ${[...new Set(forbiddenKnownCountries)].join(", ")}.`);
  }
  const structuredCountryClaims = [
    ...fullText.matchAll(
      /\b(?:République|Royaume|Empire|Fédération|Union|État|Confédération|Sultanat|Principauté|Duché|Califat)\s+(?:(?:de|du|des|d['’])\s*)?([A-ZÀ-ÖØ-Þ][\p{L}'’.-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*){0,3})/gu,
    ),
  ].map(([claim]) => claim);
  if (
    structuredCountryClaims.some(
      (claim) => !(options.allowedCountries ?? []).some((country) => textMentionsCountry(claim, country)),
    )
  ) {
    errors.push("Un pays structuré est absent des faits.");
  }

  const allowedNumbers = new Set((options.allowedNumbers ?? []).map(normalizeNumberToken));
  const unknownNumbers = [...fullText.matchAll(/\b\d+(?:[.,]\d+)?\b/g)]
    .map(([number]) => number)
    .filter(
      (number) =>
        !allowedNumbers.has(normalizeNumberToken(number)) &&
        !(options.allowedDates ?? []).some((date) => date.includes(number)),
    );
  if (unknownNumbers.length) errors.push(`Nombres non autorisés : ${[...new Set(unknownNumbers)].join(", ")}.`);

  return errors.length ? { errors } : { output, errors };
}
