import { createClient } from "@/lib/supabase/server";
import { AdminHistoryList, type AdminHistoryRow } from "./AdminHistoryList";

const TABLE_LABELS: Record<string, string> = {
  countries: "Pays",
  rule_parameters: "Règles",
  state_action_types: "Actions d’État",
  military_roster_units: "Unités militaires",
  military_roster_unit_levels: "Niveaux militaires",
  perk_categories: "Catégories d’avantages",
  perks: "Avantages",
  perk_effects: "Effets d’avantage",
  perk_requirements: "Conditions d’avantage",
  country_budget: "Budget du pays",
  country_laws: "Lois du pays",
  country_military_units: "Armée du pays",
  country_military_limits: "Limites militaires",
  country_etat_major_focus: "État-major",
  country_control: "Contrôle territorial",
  country_perks: "Avantages du pays",
  country_effects: "Effets du pays",
  country_players: "Joueurs",
  country_relations: "Relations diplomatiques",
  country_state_action_balance: "Points d’action",
  wiki_pages: "Wiki",
};

const RESTORABLE_TABLES = new Set(Object.keys(TABLE_LABELS));

type LogRow = {
  id: string;
  actor_email: string | null;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  reverted_at: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function AdminHistoryPage() {
  const supabase = await createClient();
  const [historyRes, countriesRes] = await Promise.all([
    supabase
      .from("admin_change_log")
      .select("id, actor_email, table_name, operation, before_data, after_data, created_at, reverted_at")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase.from("countries").select("id, name"),
  ]);

  if (historyRes.error) {
    throw new Error(`Impossible de charger l’historique : ${historyRes.error.message}`);
  }

  const countryNames = new Map(
    (countriesRes.data ?? []).map((country) => [country.id, country.name])
  );
  const rows: AdminHistoryRow[] = ((historyRes.data ?? []) as LogRow[]).map((row) => {
    const data = row.after_data ?? row.before_data ?? {};
    const countryName = countryNames.get(text(data.country_id) ?? "");
    const entityLabel =
      text(data.name) ??
      text(data.name_fr) ??
      text(data.title) ??
      countryName ??
      text(data.label_fr) ??
      text(data.key) ??
      text(data.law_key) ??
      TABLE_LABELS[row.table_name] ??
      "Modification";

    return {
      id: row.id,
      actorEmail: row.actor_email ?? "Administrateur",
      tableName: row.table_name,
      tableLabel: TABLE_LABELS[row.table_name] ?? row.table_name,
      entityLabel,
      operation: row.operation,
      beforeData: row.before_data,
      afterData: row.after_data,
      createdAt: row.created_at,
      revertedAt: row.reverted_at,
      canRestore: row.operation === "UPDATE" && RESTORABLE_TABLES.has(row.table_name),
    };
  });

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Historique</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Les modifications des administrateurs, de la plus récente à la plus ancienne.
          </p>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          {rows.length} modification{rows.length > 1 ? "s" : ""}
        </p>
      </div>
      <AdminHistoryList rows={rows} />
    </div>
  );
}
