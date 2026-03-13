"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getEffectKindOptionGroups,
  getEffectKindValueHelper,
  getDefaultTargetForKind,
  STAT_KEYS,
  STAT_LABELS,
  getBudgetMinistryOptions,
  MILITARY_BRANCH_EFFECT_IDS,
  MILITARY_BRANCH_EFFECT_LABELS,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
  EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
  EFFECT_KINDS_WITH_SUB_TYPE_TARGET,
  SUB_TYPE_TARGET_SEP,
  formatSubTypeTargetLabel,
  getEffectDescription,
} from "@/lib/countryEffects";
import type { ResolvedEffect } from "@/lib/countryEffects";
import type { PerkCategory, Perk, PerkEffect } from "@/types/database";
import {
  ALL_REQUIREMENT_KIND_IDS,
  REQUIREMENT_KIND_META,
  getRequirementValueHelper,
  formatRequirementLabel,
} from "@/lib/perkRequirements";
import {
  createPerkCategory,
  updatePerkCategory,
  deletePerkCategory,
  createPerk,
  updatePerk,
  deletePerk,
  type PerkEffectInput,
  type PerkRequirementInput,
} from "./actions";

const inputClass = "w-full rounded border py-1.5 px-2 text-sm text-[var(--foreground)]";
const inputStyle = { borderColor: "var(--border)", background: "var(--background)" } as const;

type RosterUnit = { id: string; name_fr: string; branch: string; sub_type: string | null };

type AvantagesManagerProps = {
  categories: PerkCategory[];
  perks: Array<Perk & { perk_effects?: PerkEffect[]; perk_requirements?: Array<{ requirement_kind: string; requirement_target: string | null; value: number }> }>;
  rosterUnits: RosterUnit[];
};

export function AvantagesManager({
  categories: initialCategories,
  perks: initialPerks,
  rosterUnits,
}: AvantagesManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [perks, setPerks] = useState(initialPerks);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState(0);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [perkFormOpen, setPerkFormOpen] = useState(false);
  const [editingPerkId, setEditingPerkId] = useState<string | null>(null);
  const [perkName, setPerkName] = useState("");
  const [perkDescription, setPerkDescription] = useState("");
  const [perkCategoryId, setPerkCategoryId] = useState<string>("");
  const [perkIconUrl, setPerkIconUrl] = useState("");
  const [perkIconFile, setPerkIconFile] = useState<File | null>(null);
  const [perkIconPreview, setPerkIconPreview] = useState<string | null>(null);
  const [perkIconSize, setPerkIconSize] = useState(48);
  const [perkSortOrder, setPerkSortOrder] = useState(0);
  const [perkEffects, setPerkEffects] = useState<PerkEffectInput[]>([]);
  const [perkRequirements, setPerkRequirements] = useState<PerkRequirementInput[]>([]);
  const [perkError, setPerkError] = useState<string | null>(null);

  const [requirementFormOpen, setRequirementFormOpen] = useState(false);
  const [editingRequirementIndex, setEditingRequirementIndex] = useState<number | null>(null);
  const [requirementKind, setRequirementKind] = useState<string>("stat");
  const [requirementTarget, setRequirementTarget] = useState<string>("");
  const [requirementValue, setRequirementValue] = useState("");

  const [effectFormOpen, setEffectFormOpen] = useState(false);
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null);
  const [effectKind, setEffectKind] = useState<string>(() => getEffectKindOptionGroups()[0]?.options[0]?.id ?? "gdp_growth_base");
  const [effectTarget, setEffectTarget] = useState<string | null>(null);
  const [effectValue, setEffectValue] = useState("");

  const subTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const u of rosterUnits) {
      const branch = u.branch ?? "terre";
      const subType = u.sub_type ?? null;
      const value = `${branch}${SUB_TYPE_TARGET_SEP}${subType ?? ""}`;
      if (seen.has(value)) continue;
      seen.add(value);
      list.push({ value, label: formatSubTypeTargetLabel(branch, subType) });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [rosterUnits]);

  const rosterUnitIds = useMemo(() => rosterUnits.map((u) => u.id), [rosterUnits]);
  const defaultTarget = useMemo(
    () => getDefaultTargetForKind(effectKind, rosterUnitIds, undefined, subTypeOptions.map((o) => o.value)),
    [effectKind, rosterUnitIds, subTypeOptions]
  );
  const currentEffectTarget = effectTarget ?? defaultTarget;

  function openAddCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategorySortOrder(categories.length);
    setCategoryError(null);
    setCategoryFormOpen(true);
  }
  function openEditCategory(cat: PerkCategory) {
    setEditingCategoryId(cat.id);
    setCategoryName(cat.name_fr);
    setCategorySortOrder(cat.sort_order);
    setCategoryError(null);
    setCategoryFormOpen(true);
  }
  async function saveCategory() {
    setCategoryError(null);
    const formData = new FormData();
    formData.set("name_fr", categoryName);
    formData.set("sort_order", String(categorySortOrder));
    const result = editingCategoryId
      ? await updatePerkCategory(editingCategoryId, formData)
      : await createPerkCategory(formData);
    if (result.error) {
      setCategoryError(result.error);
      return;
    }
    setCategoryFormOpen(false);
    window.location.reload();
  }
  async function handleDeleteCategory(id: string) {
    if (!confirm("Supprimer cette catégorie ? Les avantages qui y sont rattachés n’auront plus de catégorie.")) return;
    await deletePerkCategory(id);
    window.location.reload();
  }

  useEffect(() => {
    if (perkIconFile) {
      const url = URL.createObjectURL(perkIconFile);
      setPerkIconPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPerkIconPreview(null);
  }, [perkIconFile]);

  async function uploadPerkIcon(file: File): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `icons/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("avantages").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("avantages").getPublicUrl(path);
    return data.publicUrl;
  }

  function openAddPerk() {
    setEditingPerkId(null);
    setPerkName("");
    setPerkDescription("");
    setPerkCategoryId(categories[0]?.id ?? "");
    setPerkIconUrl("");
    setPerkIconFile(null);
    setPerkIconSize(48);
    setPerkSortOrder(perks.length + 1);
    setPerkEffects([]);
    setPerkRequirements([]);
    setRequirementFormOpen(false);
    setEditingRequirementIndex(null);
    setEffectFormOpen(false);
    setEditingEffectIndex(null);
    setPerkError(null);
    setPerkFormOpen(true);
  }
  function openEditPerk(p: Perk & { perk_effects?: PerkEffect[]; perk_requirements?: Array<{ requirement_kind: string; requirement_target: string | null; value: number }> }) {
    setEditingPerkId(p.id);
    setPerkName(p.name_fr);
    setPerkDescription(p.description_fr ?? "");
    setPerkCategoryId(p.category_id ?? "");
    setPerkIconUrl(p.icon_url ?? "");
    setPerkIconFile(null);
    setPerkIconSize(p.icon_size ?? 48);
    setPerkSortOrder((p.sort_order ?? 0) + 1);
    setPerkEffects(
      (p.perk_effects ?? []).map((e) => ({
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        effect_subtype: e.effect_subtype ?? null,
        value: Number(e.value),
      }))
    );
    setPerkRequirements(
      (p.perk_requirements ?? []).map((r) => ({
        requirement_kind: r.requirement_kind,
        requirement_target: r.requirement_target ?? null,
        value: Number(r.value),
      }))
    );
    setRequirementFormOpen(false);
    setEditingRequirementIndex(null);
    setEffectFormOpen(false);
    setEditingEffectIndex(null);
    setPerkError(null);
    setPerkFormOpen(true);
  }
  async function savePerk() {
    setPerkError(null);
    let iconUrl = perkIconUrl.trim() || null;
    if (perkIconFile) {
      try {
        iconUrl = await uploadPerkIcon(perkIconFile);
      } catch (err) {
        setPerkError(err instanceof Error ? err.message : "Échec du téléversement de l’icône.");
        return;
      }
    }
    const formData = new FormData();
    formData.set("name_fr", perkName);
    formData.set("description_fr", perkDescription);
    formData.set("category_id", perkCategoryId);
    formData.set("icon_url", iconUrl ?? "");
    formData.set("icon_size", String(perkIconSize));
    formData.set("sort_order", String(Math.max(1, perkSortOrder)));
    const result = editingPerkId
      ? await updatePerk(editingPerkId, formData, perkEffects, perkRequirements)
      : await createPerk(formData, perkEffects, perkRequirements);
    if (result.error) {
      setPerkError(result.error);
      return;
    }
    setPerkFormOpen(false);
    window.location.reload();
  }
  async function handleDeletePerk(id: string) {
    if (!confirm("Supprimer cet avantage ?")) return;
    await deletePerk(id);
    window.location.reload();
  }

  function addEffect() {
    const helper = getEffectKindValueHelper(effectKind);
    const num = Number(effectValue);
    const value = Number.isFinite(num) ? helper.displayToStored(num) : 0;
    setPerkEffects((prev) => {
      const next = { effect_kind: effectKind, effect_target: currentEffectTarget, value };
      if (editingEffectIndex == null) {
        return [...prev, next];
      }
      return prev.map((e, i) => (i === editingEffectIndex ? next : e));
    });
    setEffectFormOpen(false);
    setEffectValue("");
    setEditingEffectIndex(null);
  }
  function removeEffect(index: number) {
    setPerkEffects((prev) => prev.filter((_, i) => i !== index));
    setEditingEffectIndex(null);
  }

  const metaForRequirementKind = REQUIREMENT_KIND_META[requirementKind as keyof typeof REQUIREMENT_KIND_META] ?? { needsTarget: false, targetOptions: [] };
  const requirementTargetOptions = metaForRequirementKind.targetOptions ?? [];

  function addRequirement() {
    const helper = getRequirementValueHelper(requirementKind);
    const num = Number(requirementValue);
    const value = Number.isFinite(num) ? helper.displayToStored(num) : 0;
    const target = metaForRequirementKind.needsTarget && requirementTargetOptions.length ? (requirementTarget || requirementTargetOptions[0]?.value) : null;
    setPerkRequirements((prev) => {
      const next = { requirement_kind: requirementKind, requirement_target: target, value };
      if (editingRequirementIndex == null) {
        return [...prev, next];
      }
      return prev.map((r, i) => (i === editingRequirementIndex ? next : r));
    });
    setRequirementFormOpen(false);
    setRequirementValue("");
    setEditingRequirementIndex(null);
  }
  function removeRequirement(index: number) {
    setPerkRequirements((prev) => prev.filter((_, i) => i !== index));
    setEditingRequirementIndex(null);
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">Catégories</h2>
        <ul className="space-y-2">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
              style={{ borderColor: "var(--border-muted)" }}
            >
              <span className="font-medium text-[var(--foreground)]">{cat.name_fr}</span>
              <span className="text-sm text-[var(--foreground-muted)]">Ordre : {cat.sort_order}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditCategory(cat)}
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="text-sm text-[var(--danger)] hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!categoryFormOpen ? (
          <button
            type="button"
            onClick={openAddCategory}
            className="mt-3 rounded border py-2 px-4 text-sm font-medium"
            style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
          >
            Ajouter une catégorie
          </button>
        ) : (
          <div className="mt-3 rounded border p-4 space-y-3" style={{ borderColor: "var(--border-muted)" }}>
            {categoryError && <p className="text-sm text-[var(--danger)]">{categoryError}</p>}
            <div>
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Nom</label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Ordre</label>
              <input
                type="number"
                value={categorySortOrder}
                onChange={(e) => setCategorySortOrder(Number(e.target.value) || 0)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveCategory}
                className="rounded py-1.5 px-3 text-sm font-medium"
                style={{ background: "var(--accent)", color: "#0f1419" }}
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setCategoryFormOpen(false)}
                className="rounded border py-1.5 px-3 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">Avantages</h2>
        <ul className="space-y-2">
          {perks.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
              style={{ borderColor: "var(--border-muted)" }}
            >
              <div>
                <span className="font-medium text-[var(--foreground)]">{p.name_fr}</span>
                {p.category_id && (
                  <span className="ml-2 text-xs text-[var(--foreground-muted)]">
                    ({categoryById.get(p.category_id)?.name_fr ?? p.category_id})
                  </span>
                )}
                <span className="ml-2 text-xs text-[var(--foreground-muted)]">
                  {(p.perk_requirements?.length ?? 0) > 0 ? `${p.perk_requirements!.length} requis` : "Aucun requis"}
                </span>
                {(p.perk_effects?.length ?? 0) > 0 && (
                  <span className="ml-2 text-xs text-[var(--accent)]">
                    {p.perk_effects!.length} effet(s)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditPerk(p)}
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePerk(p.id)}
                  className="text-sm text-[var(--danger)] hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!perkFormOpen ? (
          <button
            type="button"
            onClick={openAddPerk}
            className="mt-3 rounded border py-2 px-4 text-sm font-medium"
            style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
          >
            Ajouter un avantage
          </button>
        ) : (
          <div className="mt-3 rounded border p-4 space-y-4" style={{ borderColor: "var(--border-muted)" }}>
            {perkError && <p className="text-sm text-[var(--danger)]">{perkError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Titre</label>
                <input
                  type="text"
                  value={perkName}
                  onChange={(e) => setPerkName(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Catégorie</label>
                <select
                  value={perkCategoryId}
                  onChange={(e) => setPerkCategoryId(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">— Aucune —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_fr}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Description (fluff)</label>
              <textarea
                value={perkDescription}
                onChange={(e) => setPerkDescription(e.target.value)}
                rows={2}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Icône</label>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPerkIconFile(f ?? null);
                      if (!f) setPerkIconUrl("");
                      e.target.value = "";
                    }}
                    className="block w-full text-sm text-[var(--foreground-muted)] file:mr-2 file:rounded file:border-0 file:py-1.5 file:px-3 file:text-sm file:font-medium file:bg-[var(--accent)] file:text-[#0f1419]"
                  />
                  <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                    Téléverser un fichier (tous les fichiers sont regroupés dans le dossier <em>avantages/icons</em>).
                  </p>
                </div>
                <div className="min-w-[12rem] flex-1">
                  <span className="mb-0.5 block text-xs text-[var(--foreground-muted)]">ou URL</span>
                  <input
                    type="text"
                    value={perkIconUrl}
                    onChange={(e) => { setPerkIconUrl(e.target.value); setPerkIconFile(null); }}
                    placeholder="https://..."
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Taille (px)</label>
                  <input
                    type="number"
                    min={16}
                    max={256}
                    value={perkIconSize}
                    onChange={(e) => setPerkIconSize(Math.min(256, Math.max(16, Number(e.target.value) || 48)))}
                    className={inputClass}
                    style={{ ...inputStyle, width: "5rem" }}
                  />
                </div>
              </div>
              {(perkIconPreview || perkIconUrl) && (
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={perkIconPreview || perkIconUrl || ""}
                    alt=""
                    width={perkIconSize}
                    height={perkIconSize}
                    className="rounded object-cover"
                    style={{ border: "1px solid var(--border-muted)" }}
                  />
                  <span className="text-xs text-[var(--foreground-muted)]">
                    Aperçu · affichage en {perkIconSize}×{perkIconSize} px
                  </span>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Ordre</label>
                <input
                  type="number"
                  value={perkSortOrder}
                  onChange={(e) => setPerkSortOrder(Number(e.target.value) || 0)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Requis (dynamiques)</p>
              <ul className="space-y-2">
                {perkRequirements.map((r, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border py-1.5 px-2 text-sm"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <span className="text-[var(--foreground)]">
                      {formatRequirementLabel(r)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRequirementFormOpen(true);
                          setEditingRequirementIndex(idx);
                          const kind = r.requirement_kind;
                          setRequirementKind(kind);
                          const meta = REQUIREMENT_KIND_META[kind as keyof typeof REQUIREMENT_KIND_META];
                          setRequirementTarget(r.requirement_target ?? meta?.targetOptions?.[0]?.value ?? "");
                          const helper = getRequirementValueHelper(kind);
                          setRequirementValue(String(helper.storedToDisplay(Number(r.value))));
                        }}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRequirement(idx)}
                        className="text-xs text-[var(--danger)] hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {!requirementFormOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setRequirementFormOpen(true);
                    const kind = ALL_REQUIREMENT_KIND_IDS[0];
                    setRequirementKind(kind);
                    const meta = REQUIREMENT_KIND_META[kind];
                    setRequirementTarget(meta.targetOptions?.[0]?.value ?? "");
                    setRequirementValue("");
                  }}
                  className="mt-1 text-sm text-[var(--accent)] hover:underline"
                >
                  + Ajouter un requis
                </button>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded border p-2" style={{ borderColor: "var(--border-muted)" }}>
                  <div>
                    <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type</label>
                    <select
                      value={requirementKind}
                      onChange={(e) => {
                        setRequirementKind(e.target.value);
                        const meta = REQUIREMENT_KIND_META[e.target.value as keyof typeof REQUIREMENT_KIND_META];
                        setRequirementTarget(meta?.targetOptions?.[0]?.value ?? "");
                      }}
                      className={inputClass}
                      style={{ ...inputStyle, minWidth: "10rem" }}
                    >
                      {ALL_REQUIREMENT_KIND_IDS.map((k) => (
                        <option key={k} value={k}>{REQUIREMENT_KIND_META[k].label}</option>
                      ))}
                    </select>
                  </div>
                  {metaForRequirementKind.needsTarget && requirementTargetOptions.length > 0 && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{metaForRequirementKind.targetLabel ?? "Cible"}</label>
                      <select
                        value={requirementTarget}
                        onChange={(e) => setRequirementTarget(e.target.value)}
                        className={inputClass}
                        style={{ ...inputStyle, minWidth: "10rem" }}
                      >
                        {requirementTargetOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getRequirementValueHelper(requirementKind).valueLabel}</label>
                    <input
                      type="number"
                      step={getRequirementValueHelper(requirementKind).valueStep}
                      value={requirementValue}
                      onChange={(e) => setRequirementValue(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, width: "6rem" }}
                    />
                  </div>
                  <button type="button" onClick={addRequirement} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>
                    Ajouter
                  </button>
                  <button type="button" onClick={() => setRequirementFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    Annuler
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Effets (logique dynamique)</p>
              <ul className="space-y-2">
                {perkEffects.map((e, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border py-1.5 px-2 text-sm"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <span className="text-[var(--foreground)]">
                      {getEffectDescription(
                        {
                          effect_kind: e.effect_kind,
                          effect_target: e.effect_target,
                          value: e.value,
                        } as ResolvedEffect,
                        {
                          rosterUnitName: (id) => rosterUnits.find((u) => u.id === id)?.name_fr ?? null,
                          countryName: () => null,
                        }
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEffectFormOpen(true);
                          setEditingEffectIndex(idx);
                          setEffectKind(e.effect_kind);
                          setEffectTarget(e.effect_target ?? null);
                          const helper = getEffectKindValueHelper(e.effect_kind);
                          setEffectValue(String(helper.storedToDisplay(e.value)));
                        }}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEffect(idx)}
                        className="text-xs text-[var(--danger)] hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {!effectFormOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setEffectFormOpen(true);
                    setEditingEffectIndex(null);
                    setEffectKind(getEffectKindOptionGroups()[0]?.options[0]?.id ?? "gdp_growth_base");
                    setEffectTarget(null);
                    setEffectValue("");
                  }}
                  className="mt-2 text-sm text-[var(--accent)] hover:underline"
                >
                  Ajouter un effet
                </button>
              ) : (
                <div className="mt-2 rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                  <div>
                    <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d&apos;effet</label>
                    <select
                      value={effectKind}
                      onChange={(e) => {
                        const k = e.target.value;
                        setEffectKind(k);
                        setEffectTarget(getDefaultTargetForKind(k, rosterUnitIds, undefined, subTypeOptions.map((o) => o.value)));
                      }}
                      className={inputClass}
                      style={inputStyle}
                    >
                      {getEffectKindOptionGroups().map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind) && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Stat</label>
                      <select
                        value={currentEffectTarget ?? STAT_KEYS[0]}
                        onChange={(e) => setEffectTarget(e.target.value || null)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {STAT_KEYS.map((k) => (
                          <option key={k} value={k}>{STAT_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind) && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label>
                      <select
                        value={currentEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""}
                        onChange={(e) => setEffectTarget(e.target.value || null)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {getBudgetMinistryOptions().map(({ key, label }) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind) && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label>
                      <select
                        value={currentEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]}
                        onChange={(e) => setEffectTarget(e.target.value || null)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                          <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind) && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label>
                      <select
                        value={currentEffectTarget ?? rosterUnits[0]?.id ?? ""}
                        onChange={(e) => setEffectTarget(e.target.value || null)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {rosterUnits.map((u) => (
                          <option key={u.id} value={u.id}>{u.name_fr}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectKind) && (
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Sous-branche/type</label>
                      <select
                        value={currentEffectTarget ?? subTypeOptions[0]?.value ?? ""}
                        onChange={(e) => setEffectTarget(e.target.value || null)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {subTypeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                      {getEffectKindValueHelper(effectKind).valueLabel}
                    </label>
                    <input
                      type="number"
                      step={getEffectKindValueHelper(effectKind).valueStep}
                      value={effectValue}
                      onChange={(e) => setEffectValue(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, maxWidth: "12rem" }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addEffect}
                      className="rounded py-1.5 px-3 text-sm font-medium"
                      style={{ background: "var(--accent)", color: "#0f1419" }}
                    >
                      Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEffectFormOpen(false);
                        setEditingEffectIndex(null);
                      }}
                      className="rounded border py-1.5 px-3 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={savePerk}
                className="rounded py-2 px-4 text-sm font-medium"
                style={{ background: "var(--accent)", color: "#0f1419" }}
              >
                {editingPerkId ? "Enregistrer" : "Créer l'avantage"}
              </button>
              <button
                type="button"
                onClick={() => setPerkFormOpen(false)}
                className="rounded border py-2 px-4 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
