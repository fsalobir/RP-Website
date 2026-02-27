"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  return [];
}

function toInt(v: string, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
  const [units, setUnits] = useState<UnitRow[]>(initialUnits);
  const [levels, setLevels] = useState<LevelRow[]>(initialLevels);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  function updateLevel(unitId: string, levelNum: number, manpower: number) {
    setLevels((prev) => {
      const next = [...prev];
      const idx = next.findIndex((l) => l.unit_id === unitId && l.level === levelNum);
      if (idx >= 0) {
        next[idx] = { ...next[idx], manpower };
        return next;
      }
      next.push({
        id: `new_${crypto.randomUUID()}`,
        unit_id: unitId,
        level: levelNum,
        manpower,
        created_at: new Date().toISOString(),
      });
      return next;
    });
  }

  function ensureLevelsForUnit(unit: UnitRow) {
    const arr = levelsByUnitId.get(unit.id) ?? [];
    const existing = new Set(arr.map((l) => l.level));
    for (let i = 1; i <= unit.level_count; i++) {
      if (!existing.has(i)) updateLevel(unit.id, i, 0);
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
    setSavingId(unit.id);
    try {
      const supabase = createClient();

      const clean = {
        branch: unit.branch,
        sub_type: unit.sub_type && unit.sub_type.trim() ? unit.sub_type.trim() : null,
        name_fr: unit.name_fr.trim(),
        icon_url: unit.icon_url?.trim() ? unit.icon_url.trim() : null,
        level_count: clampInt(Number(unit.level_count) || 1, 1, 10),
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
        toUpsert.push({
          unit_id: unitId,
          level: lvl,
          manpower: Math.max(0, Number(row?.manpower ?? 0) || 0),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteUnit(unit: UnitRow) {
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setSavingId(null);
    }
  }

  const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
  const unitsByBranch = useMemo(() => {
    const m = new Map<MilitaryBranch, UnitRow[]>();
    for (const b of branches) m.set(b, []);
    for (const u of units) m.get(u.branch)!.push(u);
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_fr.localeCompare(b.name_fr));
    }
    return m;
  }, [units]);

  return (
    <div className="space-y-8">
      <section className={panelClass} style={panelStyle}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Unités</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Les niveaux sont “graduels” (100 points par niveau). Ici, vous définissez seulement le nombre de niveaux et le manpower par niveau.
            </p>
          </div>
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

        {error && (
          <p className="mt-4 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </section>

      {branches.map((branch) => {
        const list = unitsByBranch.get(branch) ?? [];
        return (
          <section key={branch} className={panelClass} style={panelStyle}>
            <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              {branchEmoji(branch)} {BRANCH_LABELS[branch]}
            </h3>

            {list.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">Aucune unité.</p>
            ) : (
              <div className="space-y-6">
                {list.map((u) => {
                  const isSaving = savingId === u.id;
                  const suggestions = subtypeSuggestions(u.branch);
                  const unitLevels = levelsByUnitId.get(u.id) ?? [];
                  const expanded = expandedIds.has(u.id);

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
                            <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                              {u.name_fr || "Nouvelle unité"}
                            </div>
                            <div className="truncate text-xs text-[var(--foreground-muted)]">
                              {BRANCH_LABELS[u.branch]}
                              {u.sub_type ? ` • ${u.sub_type}` : ""}
                            </div>
                          </div>
                        </div>
                        <span
                          className="inline-block shrink-0 text-xs text-[var(--foreground-muted)] transition-transform duration-200 ease-out"
                          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
                          aria-hidden
                        >
                          ▼
                        </span>
                      </button>

                      <div
                        className="overflow-hidden transition-all duration-200 ease-out"
                        style={{
                          maxHeight: expanded ? 2000 : 0,
                          opacity: expanded ? 1 : 0,
                        }}
                      >
                        <div className="border-t px-3 py-3 text-xs sm:text-sm" style={{ borderColor: "var(--border-muted)" }}>
                          {/* Ligne 1 : Icône + Nom */}
                          <div className="grid gap-3 sm:grid-cols-[auto,minmax(0,1fr)] items-center mb-3">
                            <div>
                              <div className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Icône
                              </div>
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
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Nom
                              </label>
                              <input
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
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Type
                              </label>
                              <select
                                className={`${inputClass} mt-1`}
                                style={inputStyle}
                                value={u.branch}
                                onChange={(e) => updateUnit(u.id, { branch: e.target.value as MilitaryBranch })}
                                disabled={isSaving}
                              >
                                {branches.map((b) => (
                                  <option key={b} value={b}>
                                    {BRANCH_LABELS[b]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Sous-type (optionnel)
                              </label>
                              <input
                                className={`${inputClass} mt-1`}
                                style={inputStyle}
                                value={u.sub_type ?? ""}
                                onChange={(e) => updateUnit(u.id, { sub_type: e.target.value })}
                                placeholder={u.branch === "strategique" ? "Ex: Dissuasion, Cyber…" : "Ex: Infanterie…"}
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
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Base
                              </label>
                              <input
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
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Tri
                              </label>
                              <input
                                type="number"
                                className={`${inputClass} mt-1 font-mono w-20`}
                                style={inputStyle}
                                value={u.sort_order}
                                onChange={(e) => updateUnit(u.id, { sort_order: toInt(e.target.value, 0) })}
                                disabled={isSaving}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase text-[var(--foreground-muted)]">
                                Niveaux
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                className={`${inputClass} mt-1 font-mono w-20`}
                                style={inputStyle}
                                value={u.level_count}
                                onChange={(e) => {
                                  const n = clampInt(toInt(e.target.value, 1), 1, 10);
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

                          {/* Ligne 4 : Manpower par niveau */}
                          <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-[var(--foreground)]">
                                Manpower par niveau
                              </div>
                              <div className="text-[10px] text-[var(--foreground-muted)]">
                                Valeurs entières.
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                              {Array.from({ length: u.level_count }, (_, i) => i + 1).map((lvl) => {
                                const row = unitLevels.find((l) => l.level === lvl);
                                const manpower = Number(row?.manpower ?? 0);
                                return (
                                  <div key={lvl}>
                                    <label className="mb-0.5 block text-[10px] text-[var(--foreground-muted)]">
                                      Niv. {lvl}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      className={`${inputClass} font-mono w-24`}
                                      style={inputStyle}
                                      value={manpower}
                                      onChange={(e) => updateLevel(u.id, lvl, Math.max(0, toInt(e.target.value, 0)))}
                                      disabled={isSaving}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

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

