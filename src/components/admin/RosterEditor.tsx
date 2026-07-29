"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";
import { AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";
import { matchesSearchText } from "@/lib/searchText";
import { formatNumber } from "@/lib/format";
import {
  buildRosterTemplateCsv,
  parseRosterCsv,
  ROSTER_CSV_MAX_LEVELS,
  ROSTER_DISPLAY_BRANCH_ORDER,
} from "@/lib/rosterCsv";
import type { MilitaryBranch, MilitaryRosterUnit, MilitaryRosterUnitLevel } from "@/types/database";

type UnitRow = Omit<MilitaryRosterUnit, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

type LevelRow = MilitaryRosterUnitLevel;

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terrestre",
  air: "Aérien",
  mer: "Naval",
  strategique: "Stratégique",
};

function branchEmoji(b: MilitaryBranch) {
  return b === "terre" ? "🪖" : b === "air" ? "✈️" : b === "mer" ? "🚢" : "🛰️";
}

function subtypeSuggestions(branch: MilitaryBranch): string[] {
  if (branch === "terre") return ["Infanterie", "Blindé", "Soutien"];
  if (branch === "air") return ["Avions", "Avions lourds", "Hélicoptères"];
  if (branch === "mer") return ["Navires légers", "Navires lourds", "Sous-marins"];
  return ["Stock stratégique", "Lanceurs"];
}

function toInt(v: string, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const ROSTER_LEVEL_MAX = ROSTER_CSV_MAX_LEVELS;
const ROSTER_BRANCHES: MilitaryBranch[] = [...ROSTER_DISPLAY_BRANCH_ORDER];

function makeNewUnit(): UnitRow {
  return {
    id: `new_${crypto.randomUUID()}`,
    branch: "terre",
    sub_type: null,
    name_fr: "",
    icon_url: null,
    level_count: 6,
    base_count: 0,
    sort_order: 0,
  };
}

export function RosterEditor({
  initialUnits,
  initialLevels,
}: {
  initialUnits: MilitaryRosterUnit[];
  initialLevels: MilitaryRosterUnitLevel[];
}) {
  const router = useRouter();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [units, setUnits] = useState<UnitRow[]>(initialUnits);
  const [levels, setLevels] = useState<LevelRow[]>(initialLevels);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportReport, setCsvImportReport] = useState<string | null>(null);
  const [csvImportErrors, setCsvImportErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const levelsByUnitId = useMemo(() => {
    const m = new Map<string, LevelRow[]>();
    for (const l of levels) {
      if (!m.has(l.unit_id)) m.set(l.unit_id, []);
      m.get(l.unit_id)!.push(l);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.level - b.level);
    return m;
  }, [levels]);

  const panelClass = "rounded-lg border p-5";
  const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };
  const inputClass =
    "w-full rounded border bg-[var(--background)] px-2 py-1 text-xs sm:text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };

  function updateUnit(id: string, patch: Partial<UnitRow>) {
    setSuccess(null);
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  function updateLevel(
    unitId: string,
    levelNum: number,
    manpower: number,
    hard_power: number = 0,
    mobilization_cost: number = 100,
    science_required: number = 0
  ) {
    setSuccess(null);
    setLevels((prev) => {
      const next = [...prev];
      const idx = next.findIndex((l) => l.unit_id === unitId && l.level === levelNum);
      if (idx >= 0) {
        next[idx] = { ...next[idx], manpower, hard_power, mobilization_cost, science_required };
        return next;
      }
      next.push({
        id: `new_${crypto.randomUUID()}`,
        unit_id: unitId,
        level: levelNum,
        manpower,
        hard_power,
        mobilization_cost,
        science_required,
        created_at: new Date().toISOString(),
      });
      return next;
    });
  }

  function ensureLevelsForUnit(unit: UnitRow) {
    const arr = levelsByUnitId.get(unit.id) ?? [];
    const existing = new Set(arr.map((l) => l.level));
    for (let i = 1; i <= unit.level_count; i++) {
      if (!existing.has(i)) updateLevel(unit.id, i, 0, 0, 100, 0);
    }
  }

  async function uploadIcon(file: File): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("unit-icons").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data } = supabase.storage.from("unit-icons").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveUnit(unit: UnitRow) {
    setError(null);
    setSuccess(null);
    setSavingId(unit.id);
    try {
      const supabase = createClient();

      const clean = {
        branch: unit.branch,
        sub_type: unit.sub_type && unit.sub_type.trim() ? unit.sub_type.trim() : null,
        name_fr: unit.name_fr.trim(),
        icon_url: unit.icon_url?.trim() ? unit.icon_url.trim() : null,
        level_count: clampInt(Number(unit.level_count) || 1, 1, ROSTER_LEVEL_MAX),
        base_count: Math.max(0, Number(unit.base_count) || 0),
        sort_order: Number(unit.sort_order) || 0,
      };

      if (!clean.name_fr) {
        setError("Le nom de l’unité est obligatoire.");
        return;
      }

      const isNew = unit.id.startsWith("new_");
      let unitId = unit.id;

      if (isNew) {
        const { data, error: err } = await supabase
          .from("military_roster_units")
          .insert(clean)
          .select("*")
          .single();
        if (err) throw new Error(err.message);
        unitId = data.id as string;

        setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, id: unitId } : u)));
        setLevels((prev) => prev.map((l) => (l.unit_id === unit.id ? { ...l, unit_id: unitId } : l)));
      } else {
        const { error: err } = await supabase.from("military_roster_units").update(clean).eq("id", unit.id);
        if (err) throw new Error(err.message);
      }

      const unitLevels = (levelsByUnitId.get(unitId) ?? [])
        .filter((l) => l.level >= 1)
        .slice(0, clean.level_count);

      const byLevel = new Map<number, LevelRow>();
      for (const l of unitLevels) byLevel.set(l.level, l);

      const toUpsert = [];
      for (let lvl = 1; lvl <= clean.level_count; lvl++) {
        const row = byLevel.get(lvl);
        const r = row as LevelRow & { mobilization_cost?: number; science_required?: number };
        toUpsert.push({
          unit_id: unitId,
          level: lvl,
          manpower: Math.max(0, Number(row?.manpower ?? 0) || 0),
          hard_power: Math.max(0, Number((row as { hard_power?: number })?.hard_power ?? 0) || 0),
          mobilization_cost: Math.max(0, Number(r?.mobilization_cost ?? 100) || 100),
          science_required: Math.max(0, Number(r?.science_required ?? 0) || 0),
        });
      }

      const { error: lvlErr } = await supabase.from("military_roster_unit_levels").upsert(toUpsert, {
        onConflict: "unit_id,level",
      });
      if (lvlErr) throw new Error(lvlErr.message);

      // Recharger les niveaux de cette unité pour éviter les incohérences locales
      const { data: newLevels, error: reloadErr } = await supabase
        .from("military_roster_unit_levels")
        .select("*")
        .eq("unit_id", unitId)
        .order("level");
      if (reloadErr) throw new Error(reloadErr.message);
      setLevels((prev) => [
        ...prev.filter((l) => l.unit_id !== unitId),
        ...(newLevels as LevelRow[]),
      ]);
      setSuccess(`« ${clean.name_fr} » a été enregistrée.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteUnit(unit: UnitRow) {
    setError(null);
    setSuccess(null);
    if (!confirm(`Supprimer l’unité “${unit.name_fr || "Sans nom"}” ?`)) return;
    setSavingId(unit.id);
    try {
      const supabase = createClient();
      if (!unit.id.startsWith("new_")) {
        const { error: err } = await supabase.from("military_roster_units").delete().eq("id", unit.id);
        if (err) throw new Error(err.message);
      }
      setUnits((prev) => prev.filter((u) => u.id !== unit.id));
      setLevels((prev) => prev.filter((l) => l.unit_id !== unit.id));
      setSuccess("Unité supprimée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setSavingId(null);
    }
  }

  function downloadCsvTemplate() {
    setCsvImportErrors([]);
    setCsvImportReport(null);
    const csv = buildRosterTemplateCsv(units as MilitaryRosterUnit[], levels as MilitaryRosterUnitLevel[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-template-mj-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function refetchRosterFromDb() {
    const supabase = createClient();
    const [unitsRes, levelsRes] = await Promise.all([
      supabase.from("military_roster_units").select("*").order("branch").order("sort_order").order("name_fr"),
      supabase.from("military_roster_unit_levels").select("*").order("unit_id").order("level"),
    ]);
    if (unitsRes.error) throw new Error(unitsRes.error.message);
    if (levelsRes.error) throw new Error(levelsRes.error.message);
    setUnits((unitsRes.data ?? []) as UnitRow[]);
    setLevels((levelsRes.data ?? []) as LevelRow[]);
  }

  async function importRosterCsv(file: File) {
    setCsvImportErrors([]);
    setCsvImportReport(null);
    setError(null);
    setCsvImporting(true);
    try {
      const text = await file.text();
      const parsed = parseRosterCsv(text);
      if (!parsed.ok) {
        setCsvImportErrors(parsed.errors.map((e) => `Ligne ${e.ligne}: ${e.message}`));
        return;
      }

      const validIds = new Set(units.filter((u) => !u.id.startsWith("new_")).map((u) => u.id));
      const unknown: string[] = [];
      for (const r of parsed.units) {
        if (!validIds.has(r.id_unite)) {
          unknown.push(
            `ID_Unite inconnu ou unité non enregistrée (enregistrez d’abord les nouvelles unités dans l’interface) : ${r.id_unite}`
          );
        }
      }
      if (unknown.length > 0) {
        setCsvImportErrors(unknown);
        return;
      }

      const supabase = createClient();

      for (const r of parsed.units) {
        const { error: uErr } = await supabase
          .from("military_roster_units")
          .update({
            name_fr: r.nom.trim(),
            base_count: r.base,
            level_count: r.niveaux,
          })
          .eq("id", r.id_unite);
        if (uErr) {
          throw new Error(`« ${r.nom} » (${r.id_unite}) : ${uErr.message}`);
        }

        const { data: orphanRows, error: selErr } = await supabase
          .from("military_roster_unit_levels")
          .select("id")
          .eq("unit_id", r.id_unite)
          .gt("level", r.niveaux);
        if (selErr) {
          throw new Error(`« ${r.nom} » : ${selErr.message}`);
        }
        if (orphanRows && orphanRows.length > 0) {
          const ids = orphanRows.map((o) => o.id as string);
          const { error: delErr } = await supabase.from("military_roster_unit_levels").delete().in("id", ids);
          if (delErr) {
            throw new Error(`« ${r.nom} » : ${delErr.message}`);
          }
        }

        const toUpsert = [];
        for (let lvl = 1; lvl <= r.niveaux; lvl++) {
          const L = r.levelsByNumber.get(lvl);
          if (!L) {
            throw new Error(`« ${r.nom} » : données internes manquantes pour le niveau ${lvl}.`);
          }
          toUpsert.push({
            unit_id: r.id_unite,
            level: lvl,
            manpower: L.manpower,
            hard_power: L.hard_power,
            mobilization_cost: L.cout_par_unite,
            science_required: L.science_requise,
          });
        }
        const { error: upErr } = await supabase.from("military_roster_unit_levels").upsert(toUpsert, {
          onConflict: "unit_id,level",
        });
        if (upErr) {
          throw new Error(`« ${r.nom} » : ${upErr.message}`);
        }
      }

      await refetchRosterFromDb();
      router.refresh();
      const ignored = parsed.ignoredRows.length;
      setCsvImportReport(
        ignored > 0
          ? `Import réussi : ${parsed.units.length} unité(s) mise(s) à jour. ${ignored} ligne(s) ignorée(s) (colonne « Niveau » supérieure à « Niveaux » pour l’unité).`
          : `Import réussi : ${parsed.units.length} unité(s) mise(s) à jour.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue.";
      setCsvImportErrors([
        msg,
        "Si l’erreur est survenue en cours de traitement, les lignes déjà traitées avant l’erreur peuvent avoir été enregistrées.",
      ]);
    } finally {
      setCsvImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  const unitsByBranch = useMemo(() => {
    const m = new Map<MilitaryBranch, UnitRow[]>();
    for (const b of ROSTER_BRANCHES) m.set(b, []);
    for (const u of units) {
      if (!matchesSearchText(query, [u.name_fr, u.sub_type ?? "", BRANCH_LABELS[u.branch]])) continue;
      m.get(u.branch)!.push(u);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_fr.localeCompare(b.name_fr));
    }
    return m;
  }, [query, units]);

  return (
    <div className="admin-settings-form space-y-8">
      <AdminSettingsGuide
        purpose="Le roster définit les familles d’unités accessibles à tous les pays, puis la puissance, le personnel, le coût et le niveau scientifique de chaque palier."
        impact="Ces valeurs alimentent l’état-major, les effectifs affichés, la puissance militaire et l’influence internationale."
        check="Pour chaque niveau, vérifiez que la puissance et le coût progressent de façon cohérente, et que le seuil scientifique reste atteignable."
        warning="Supprimer une unité peut retirer une référence utilisée par des pays ou des effets. L’import CSV peut modifier plusieurs unités d’un coup."
      />

      <section className={panelClass} style={panelStyle}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Unités</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-[var(--foreground-muted)]">
              Un niveau représente 100 points de progression. Ouvrez une unité pour comparer tous ses niveaux sur une seule grille.
            </p>
            <details className="mt-3 text-sm text-[var(--foreground-muted)]">
              <summary className="min-h-11 cursor-pointer text-[var(--accent)]">Comment préparer le fichier CSV</summary>
              <p className="max-w-[72ch] pb-2 leading-relaxed">
                Utilisez une ligne par niveau. Renseignez le nom, la base et le nombre de niveaux uniquement sur la ligne du niveau 1 ; les lignes suivantes portent seulement les valeurs propres à leur niveau.
              </p>
            </details>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCsvTemplate()}
              className="rounded border py-2 px-3 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              Télécharger CSV roster (template MJ)
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importRosterCsv(f);
              }}
            />
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              disabled={csvImporting}
              className="rounded border py-2 px-3 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {csvImporting ? "Import CSV…" : "Importer CSV roster"}
            </button>
            <button
              type="button"
              onClick={() =>
                setUnits((prev) => {
                  const u = makeNewUnit();
                  setExpandedIds((prevSet) => {
                    const next = new Set(prevSet);
                    next.add(u.id);
                    return next;
                  });
                  return [u, ...prev];
                })
              }
              className="rounded py-2 px-4 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#0f1419" }}
            >
              Ajouter une unité
            </button>
          </div>
        </div>

        <label className="mt-5 block max-w-sm">
          <span className="sr-only">Rechercher une unité</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, branche ou sous-type…"
            className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
            style={{ borderColor: "var(--border)" }}
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        {success && <p role="status" className="mt-4 text-sm text-[var(--accent)]">{success}</p>}

        {csvImportReport && (
          <p role="status" className="mt-4 text-sm text-[var(--accent)]">{csvImportReport}</p>
        )}
        {csvImportErrors.length > 0 && (
          <ul role="alert" className="mt-4 list-inside list-disc space-y-1 text-sm text-[var(--danger)]">
            {csvImportErrors.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {ROSTER_BRANCHES.map((branch) => {
        const list = unitsByBranch.get(branch) ?? [];
        if (query && list.length === 0) return null;
        return (
          <section key={branch} className={panelClass} style={panelStyle}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                {branchEmoji(branch)} {BRANCH_LABELS[branch]}
              </h3>
              <span className="text-sm text-[var(--foreground-muted)]">{list.length} unité{list.length > 1 ? "s" : ""}</span>
            </div>

            {list.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">Aucune unité.</p>
            ) : (
              <div className="space-y-6">
                {list.map((u) => {
                  const isSaving = savingId === u.id;
                  const suggestions = subtypeSuggestions(u.branch);
                  const unitLevels = levelsByUnitId.get(u.id) ?? [];
                  const expanded = expandedIds.has(u.id);
                  const levelValues = Array.from({ length: u.level_count }, (_, index) => {
                    const level = index + 1;
                    const row = unitLevels.find((item) => item.level === level);
                    return {
                      level,
                      manpower: Number(row?.manpower ?? 0),
                      hardPower: Number((row as { hard_power?: number })?.hard_power ?? 0),
                      mobilizationCost: Number((row as { mobilization_cost?: number })?.mobilization_cost ?? 100),
                      scienceRequired: Number((row as { science_required?: number })?.science_required ?? 0),
                    };
                  });
                  const maximumHardPower = Math.max(1, ...levelValues.map((level) => level.hardPower));

                  return (
                    <div
                      key={u.id}
                      className="rounded border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--background-elevated)]"
                        onClick={() =>
                          setExpandedIds((prevSet) => {
                            const next = new Set(prevSet);
                            if (next.has(u.id)) next.delete(u.id);
                            else next.add(u.id);
                            return next;
                          })
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="h-8 w-8 overflow-hidden rounded border bg-[var(--background-elevated)] shrink-0"
                            style={{ borderColor: "var(--border)" }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {u.icon_url ? (
                              <img src={u.icon_url} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <div className="h-full w-full text-center text-[10px] leading-8 text-[var(--foreground-muted)]">
                                ?
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="break-words text-sm font-semibold text-[var(--foreground)] [overflow-wrap:anywhere]">
                              {u.name_fr || "Nouvelle unité"}
                            </div>
                            <div className="break-words text-xs text-[var(--foreground-muted)] [overflow-wrap:anywhere]">
                              {BRANCH_LABELS[u.branch]}
                              {u.sub_type ? ` • ${u.sub_type}` : ""}
                              {` • ${u.level_count} niveau${u.level_count > 1 ? "x" : ""} • base ${formatNumber(u.base_count)}`}
                            </div>
                          </div>
                        </div>
                        <DisclosureChevron open={expanded} className="text-[var(--foreground-muted)]" />
                      </button>

                      {expanded && (
                      <div className="grid">
                        <div className="min-h-0 overflow-hidden border-t px-3 py-3 text-xs sm:text-sm" style={{ borderColor: "var(--border-muted)" }}>
                          {/* Ligne 1 : Icône + Nom */}
                          <div className="grid gap-3 sm:grid-cols-[auto,minmax(0,1fr)] items-center mb-3">
                            <div>
                              <label htmlFor={`roster-${u.id}-icon`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Icône
                              </label>
                              <div className="mt-1 flex items-center gap-2">
                                <div
                                  className="h-10 w-10 overflow-hidden rounded border bg-[var(--background-elevated)] shrink-0"
                                  style={{ borderColor: "var(--border)" }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {u.icon_url ? (
                                    <img src={u.icon_url} alt="" className="h-full w-full object-contain" />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <input
                                    id={`roster-${u.id}-icon`}
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    className="block w-full text-[10px] text-[var(--foreground-muted)] file:mr-2 file:rounded file:border-0 file:bg-[var(--accent)] file:px-2 file:py-1 file:text-[#0f1419] file:text-xs file:font-medium"
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      if (!f) return;
                                      try {
                                        setError(null);
                                        setSavingId(u.id);
                                        const url = await uploadIcon(f);
                                        updateUnit(u.id, { icon_url: url });
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : "Erreur upload.");
                                      } finally {
                                        setSavingId(null);
                                        e.target.value = "";
                                      }
                                    }}
                                    disabled={isSaving}
                                  />
                                  {u.icon_url && (
                                    <button
                                      type="button"
                                      className="mt-1 text-[10px] text-[var(--danger)] hover:underline"
                                      onClick={() => updateUnit(u.id, { icon_url: null })}
                                      disabled={isSaving}
                                    >
                                      Retirer l’icône
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label htmlFor={`roster-${u.id}-name`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Nom
                              </label>
                              <input
                                id={`roster-${u.id}-name`}
                                className={`${inputClass} mt-1`}
                                style={inputStyle}
                                value={u.name_fr}
                                onChange={(e) => updateUnit(u.id, { name_fr: e.target.value })}
                                placeholder="Nom de l’unité"
                                disabled={isSaving}
                              />
                            </div>
                          </div>

                          {/* Ligne 2 : Type + Sous-type */}
                          <div className="grid gap-3 sm:grid-cols-2 mb-3">
                            <div>
                              <label htmlFor={`roster-${u.id}-branch`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Type
                              </label>
                              <select
                                id={`roster-${u.id}-branch`}
                                className={`${inputClass} mt-1`}
                                style={inputStyle}
                                value={u.branch}
                                onChange={(e) => updateUnit(u.id, { branch: e.target.value as MilitaryBranch })}
                                disabled={isSaving}
                              >
                                {ROSTER_BRANCHES.map((b) => (
                                  <option key={b} value={b}>
                                    {BRANCH_LABELS[b]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`roster-${u.id}-subtype`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Sous-type (optionnel)
                              </label>
                              <input
                                id={`roster-${u.id}-subtype`}
                                className={`${inputClass} mt-1`}
                                style={inputStyle}
                                value={u.sub_type ?? ""}
                                onChange={(e) => updateUnit(u.id, { sub_type: e.target.value })}
                                placeholder={u.branch === "strategique" ? "Ex: Stock stratégique, Lanceurs…" : "Ex: Infanterie…"}
                                list={`subtypes-${u.id}`}
                                disabled={isSaving}
                              />
                              {suggestions.length > 0 && (
                                <datalist id={`subtypes-${u.id}`}>
                                  {suggestions.map((s) => (
                                    <option key={s} value={s} />
                                  ))}
                                </datalist>
                              )}
                            </div>
                          </div>

                          {/* Ligne 3 : Base + Tri + Niveaux */}
                          <div className="grid gap-3 sm:grid-cols-3 mb-3">
                            <div>
                              <label htmlFor={`roster-${u.id}-base`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Base
                              </label>
                              <input
                                id={`roster-${u.id}-base`}
                                type="number"
                                min={0}
                                className={`${inputClass} mt-1 font-mono w-24`}
                                style={inputStyle}
                                value={u.base_count}
                                onChange={(e) => updateUnit(u.id, { base_count: Math.max(0, toInt(e.target.value, 0)) })}
                                disabled={isSaving}
                              />
                            </div>
                            <div>
                              <label htmlFor={`roster-${u.id}-order`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Tri
                              </label>
                              <input
                                id={`roster-${u.id}-order`}
                                type="number"
                                className={`${inputClass} mt-1 font-mono w-20`}
                                style={inputStyle}
                                value={u.sort_order}
                                onChange={(e) => updateUnit(u.id, { sort_order: toInt(e.target.value, 0) })}
                                disabled={isSaving}
                              />
                            </div>
                            <div>
                              <label htmlFor={`roster-${u.id}-levels`} className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Niveaux
                              </label>
                              <input
                                id={`roster-${u.id}-levels`}
                                type="number"
                                min={1}
                                max={ROSTER_LEVEL_MAX}
                                className={`${inputClass} mt-1 font-mono w-20`}
                                style={inputStyle}
                                value={u.level_count}
                                onChange={(e) => {
                                  const n = clampInt(toInt(e.target.value, 1), 1, ROSTER_LEVEL_MAX);
                                  updateUnit(u.id, { level_count: n });
                                }}
                                onBlur={() => ensureLevelsForUnit(u)}
                                disabled={isSaving}
                              />
                              <p className="mt-1 text-[10px] text-[var(--foreground-muted)]">
                                100 points / niveau.
                              </p>
                            </div>
                          </div>

                          <section className="border-t pt-4" style={{ borderColor: "var(--border-muted)" }} aria-labelledby={`roster-${u.id}-levels-title`}>
                            <h4 id={`roster-${u.id}-levels-title`} className="text-sm font-semibold text-[var(--foreground)]">
                              Conséquences par niveau
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                              Lisez chaque ligne comme un palier complet : effectif d’une unité, puissance produite, coût d’acquisition et science nécessaire.
                            </p>

                            <div className="mt-4 hidden grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-3 px-3 text-xs font-medium text-[var(--foreground-muted)] sm:grid">
                              <span>Niveau</span>
                              <span>Personnel / unité</span>
                              <span>Puissance</span>
                              <span>Coût d’acquisition</span>
                              <span>Science requise</span>
                            </div>
                            <div className="mt-2 divide-y rounded-lg border" style={{ borderColor: "var(--border-muted)" }}>
                              {levelValues.map((level) => (
                                <div
                                  key={level.level}
                                  className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] sm:items-end"
                                  style={{ borderColor: "var(--border-muted)" }}
                                >
                                  <p className="col-span-2 self-center text-sm font-semibold text-[var(--foreground)] sm:col-span-1">
                                    Niv. {level.level}
                                  </p>
                                  <label htmlFor={`roster-${u.id}-manpower-${level.level}`}>
                                    <span className="mb-1 block text-xs text-[var(--foreground-muted)] sm:sr-only">Personnel / unité</span>
                                    <input
                                      id={`roster-${u.id}-manpower-${level.level}`}
                                      type="number"
                                      min={0}
                                      className={`${inputClass} min-h-11 font-mono`}
                                      style={inputStyle}
                                      value={level.manpower}
                                      onChange={(event) => updateLevel(
                                        u.id,
                                        level.level,
                                        Math.max(0, toInt(event.target.value, 0)),
                                        level.hardPower,
                                        level.mobilizationCost,
                                        level.scienceRequired
                                      )}
                                      disabled={isSaving}
                                    />
                                  </label>
                                  <label htmlFor={`roster-${u.id}-power-${level.level}`}>
                                    <span className="mb-1 block text-xs text-[var(--foreground-muted)] sm:sr-only">Puissance</span>
                                    <input
                                      id={`roster-${u.id}-power-${level.level}`}
                                      type="number"
                                      min={0}
                                      className={`${inputClass} min-h-11 font-mono`}
                                      style={inputStyle}
                                      value={level.hardPower}
                                      onChange={(event) => updateLevel(
                                        u.id,
                                        level.level,
                                        level.manpower,
                                        Math.max(0, toInt(event.target.value, 0)),
                                        level.mobilizationCost,
                                        level.scienceRequired
                                      )}
                                      disabled={isSaving}
                                    />
                                  </label>
                                  <label htmlFor={`roster-${u.id}-mobilisation-${level.level}`}>
                                    <span className="mb-1 block text-xs text-[var(--foreground-muted)] sm:sr-only">Coût d’acquisition</span>
                                    <input
                                      id={`roster-${u.id}-mobilisation-${level.level}`}
                                      type="number"
                                      min={0}
                                      className={`${inputClass} min-h-11 font-mono`}
                                      style={inputStyle}
                                      value={level.mobilizationCost}
                                      onChange={(event) => updateLevel(
                                        u.id,
                                        level.level,
                                        level.manpower,
                                        level.hardPower,
                                        Math.max(0, toInt(event.target.value, 100)),
                                        level.scienceRequired
                                      )}
                                      disabled={isSaving}
                                    />
                                  </label>
                                  <label htmlFor={`roster-${u.id}-science-${level.level}`}>
                                    <span className="mb-1 block text-xs text-[var(--foreground-muted)] sm:sr-only">Science requise</span>
                                    <input
                                      id={`roster-${u.id}-science-${level.level}`}
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      className={`${inputClass} min-h-11 font-mono`}
                                      style={inputStyle}
                                      value={level.scienceRequired}
                                      onChange={(event) => updateLevel(
                                        u.id,
                                        level.level,
                                        level.manpower,
                                        level.hardPower,
                                        level.mobilizationCost,
                                        Math.max(0, Number(event.target.value) || 0)
                                      )}
                                      disabled={isSaving}
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>

                            <div className="mt-5">
                              <p className="text-xs font-medium text-[var(--foreground)]">Progression de la puissance</p>
                              <div
                                role="img"
                                aria-label={`Progression de puissance de ${u.name_fr || "cette unité"} par niveau`}
                                className="mt-2 flex h-24 items-end gap-2 border-b px-2"
                                style={{ borderColor: "var(--border-muted)" }}
                              >
                                {levelValues.map((level) => (
                                  <div key={level.level} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                                    <span className="mb-1 truncate text-center text-[10px] text-[var(--foreground-muted)]">{formatNumber(level.hardPower)}</span>
                                    <span
                                      className="w-full rounded-t bg-[var(--accent)]"
                                      style={{ height: `${Math.max(3, (level.hardPower / maximumHardPower) * 70)}%` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="mt-1 flex gap-2 px-2">
                                {levelValues.map((level) => (
                                  <span key={level.level} className="min-w-0 flex-1 text-center text-[10px] text-[var(--foreground-muted)]">
                                    N{level.level}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </section>

                          <div
                            className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3"
                            style={{ borderColor: "var(--border-muted)" }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                ensureLevelsForUnit(u);
                                void saveUnit(u);
                              }}
                              disabled={isSaving}
                              className="rounded py-1.5 px-3 text-xs sm:text-sm font-medium disabled:opacity-50"
                              style={{ background: "var(--accent)", color: "#0f1419" }}
                            >
                              {isSaving ? "Enregistrement…" : "Enregistrer"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteUnit(u)}
                              disabled={isSaving}
                              className="rounded border py-1.5 px-3 text-xs sm:text-sm font-medium text-[var(--danger)] disabled:opacity-50"
                              style={{ borderColor: "var(--border)" }}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

