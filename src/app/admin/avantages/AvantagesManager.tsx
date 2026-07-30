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
import { AdminImpactPreview } from "@/components/admin/AdminSettingsUi";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { matchesSearchText } from "@/lib/searchText";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

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
  const [saving, setSaving] = useState(false);

  const [perkFormOpen, setPerkFormOpen] = useState(false);
  const [editingPerkId, setEditingPerkId] = useState<string | null>(null);
  const [perkName, setPerkName] = useState("");
  const [perkDescription, setPerkDescription] = useState("");
  const [perkCategoryId, setPerkCategoryId] = useState<string>("");
  const [perkIconUrl, setPerkIconUrl] = useState("");
  const [perkIconFile, setPerkIconFile] = useState<File | null>(null);
  const [perkIconSize, setPerkIconSize] = useState(48);
  const [perkSortOrder, setPerkSortOrder] = useState(0);
  const [perkEffects, setPerkEffects] = useState<PerkEffectInput[]>([]);
  const [perkRequirements, setPerkRequirements] = useState<PerkRequirementInput[]>([]);
  const [perkError, setPerkError] = useState<string | null>(null);
  const [perkQuery, setPerkQuery] = useState("");
  const [operationNotice, setOperationNotice] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "category" | "perk"; id: string; name: string } | null
  >(null);

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
  const [effectError, setEffectError] = useState<string | null>(null);

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
  const effectNeedsTarget = [
    EFFECT_KINDS_WITH_STAT_TARGET,
    EFFECT_KINDS_WITH_BUDGET_TARGET,
    EFFECT_KINDS_WITH_BRANCH_TARGET,
    EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
    EFFECT_KINDS_WITH_SUB_TYPE_TARGET,
  ].some((kinds) => kinds.has(effectKind));
  const effectValueValid = effectValue.trim() !== "" && Number.isFinite(Number(effectValue));
  const effectCanSubmit = effectValueValid && (!effectNeedsTarget || Boolean(currentEffectTarget));
  const effectPreviewValue = (() => {
    const number = Number(effectValue);
    return getEffectKindValueHelper(effectKind).displayToStored(Number.isFinite(number) ? number : 0);
  })();
  const effectPreviewLabel = effectValue.trim() === ""
    ? "Renseignez une valeur pour voir la conséquence."
    : getEffectDescription(
      { effect_kind: effectKind, effect_target: currentEffectTarget, value: effectPreviewValue } as ResolvedEffect,
      { rosterUnitName: (id) => rosterUnits.find((unit) => unit.id === id)?.name_fr ?? null }
    );

  const perkIconPreviewUrl = useMemo(() => {
    if (!perkIconFile) return null;
    return URL.createObjectURL(perkIconFile);
  }, [perkIconFile]);

  useEffect(() => {
    return () => {
      if (perkIconPreviewUrl) URL.revokeObjectURL(perkIconPreviewUrl);
    };
  }, [perkIconPreviewUrl]);

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
    setOperationNotice(null);
    if (!categoryName.trim()) {
      setCategoryError("Donnez un nom à la catégorie.");
      return;
    }
    setSaving(true);
    const formData = new FormData();
    formData.set("name_fr", categoryName.trim());
    formData.set("sort_order", String(categorySortOrder));
    try {
      const result = editingCategoryId
        ? await updatePerkCategory(editingCategoryId, formData)
        : await createPerkCategory(formData);
      if (result.error) {
        setCategoryError(result.error);
        return;
      }
      if (!result.data) {
        setCategoryError("La catégorie a été enregistrée, mais son résultat n’a pas pu être affiché. Rechargez la page.");
        return;
      }
      setCategories((previous) =>
        [...previous.filter((category) => category.id !== result.data.id), result.data]
          .sort((a, b) => a.sort_order - b.sort_order || a.name_fr.localeCompare(b.name_fr, "fr"))
      );
      setCategoryFormOpen(false);
      setEditingCategoryId(null);
      setOperationNotice({
        type: "success",
        message: editingCategoryId ? "Catégorie mise à jour." : "Catégorie créée.",
      });
    } catch {
      setCategoryError("La catégorie n’a pas pu être enregistrée. Vérifiez la connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  }
  async function handleDeleteCategory(id: string) {
    setOperationNotice(null);
    setSaving(true);
    try {
      const result = await deletePerkCategory(id);
      if (result.error) {
        setOperationNotice({ type: "error", message: result.error });
        return;
      }
      const remainingCategories = categories.filter((category) => category.id !== id);
      setCategories(remainingCategories);
      setPerks((previous) =>
        previous.map((perk) => perk.category_id === id ? { ...perk, category_id: null } : perk)
      );
      if (editingCategoryId === id) {
        setCategoryFormOpen(false);
        setEditingCategoryId(null);
      }
      if (perkCategoryId === id) {
        setPerkCategoryId(remainingCategories[0]?.id ?? "");
      }
      setOperationNotice({ type: "success", message: "Catégorie supprimée." });
    } catch {
      setOperationNotice({
        type: "error",
        message: "La catégorie n’a pas pu être supprimée. Vérifiez la connexion puis réessayez.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPerkIcon(file: File): Promise<{ url: string; path: string }> {
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `icons/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("avantages").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("avantages").getPublicUrl(path);
    return { url: data.publicUrl, path };
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
    setPerkSortOrder(p.sort_order ?? 0);
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
    if (!perkName.trim()) {
      setPerkError("Donnez un nom à l’avantage.");
      return;
    }
    setSaving(true);
    let iconUrl = perkIconUrl.trim() || null;
    let uploadedIconPath: string | null = null;
    let persistenceStarted = false;
    try {
      if (perkIconFile) {
        const uploaded = await uploadPerkIcon(perkIconFile);
        iconUrl = uploaded.url;
        uploadedIconPath = uploaded.path;
      }
      const formData = new FormData();
      formData.set("name_fr", perkName.trim());
      formData.set("description_fr", perkDescription.trim());
      formData.set("category_id", perkCategoryId);
      formData.set("icon_url", iconUrl ?? "");
      formData.set("icon_size", String(perkIconSize));
      formData.set("sort_order", String(Math.max(1, perkSortOrder)));
      persistenceStarted = true;
      const result = editingPerkId
        ? await updatePerk(editingPerkId, formData, perkEffects, perkRequirements)
        : await createPerk(formData, perkEffects, perkRequirements);
      if (result.error) {
        setPerkError(`${result.error} L’enregistrement a pu être partiel : rechargez la page avant de réessayer.`);
        return;
      }
      setPerkFormOpen(false);
      window.location.reload();
    } catch (err) {
      if (uploadedIconPath && !persistenceStarted) {
        await createClient().storage.from("avantages").remove([uploadedIconPath]);
      }
      const message = err instanceof Error ? err.message : "L’avantage n’a pas pu être enregistré.";
      setPerkError(
        persistenceStarted
          ? `${message} L’enregistrement a pu être partiel : rechargez la page avant de réessayer.`
          : message
      );
    } finally {
      setSaving(false);
    }
  }
  async function handleDeletePerk(id: string) {
    setOperationNotice(null);
    setSaving(true);
    try {
      const result = await deletePerk(id);
      if (result.error) {
        setOperationNotice({ type: "error", message: result.error });
        return;
      }
      setPerks((previous) => previous.filter((perk) => perk.id !== id));
      if (editingPerkId === id) {
        setPerkFormOpen(false);
        setEditingPerkId(null);
      }
      setOperationNotice({ type: "success", message: "Avantage supprimé." });
    } catch {
      setOperationNotice({
        type: "error",
        message: "L’avantage n’a pas pu être supprimé. Vérifiez la connexion puis réessayez.",
      });
    } finally {
      setSaving(false);
    }
  }

  function addEffect() {
    if (!effectValueValid) {
      setEffectError("Renseignez une valeur valide.");
      return;
    }
    if (effectNeedsTarget && !currentEffectTarget) {
      setEffectError("Choisissez la cible de l’effet.");
      return;
    }
    const helper = getEffectKindValueHelper(effectKind);
    const num = Number(effectValue);
    const value = helper.displayToStored(num);
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
    setEffectError(null);
  }
  function removeEffect(index: number) {
    setPerkEffects((prev) => prev.filter((_, i) => i !== index));
    setEditingEffectIndex(null);
  }

  const metaForRequirementKind = REQUIREMENT_KIND_META[requirementKind as keyof typeof REQUIREMENT_KIND_META] ?? { needsTarget: false, targetOptions: [] };
  const requirementTargetOptions = metaForRequirementKind.targetOptions ?? [];
  const requirementPreviewLabel = requirementValue.trim() === "" ? "Renseignez une valeur pour voir la condition." : (() => {
    const helper = getRequirementValueHelper(requirementKind);
    const number = Number(requirementValue);
    return formatRequirementLabel({
      requirement_kind: requirementKind,
      requirement_target: metaForRequirementKind.needsTarget ? requirementTarget || requirementTargetOptions[0]?.value || null : null,
      value: helper.displayToStored(Number.isFinite(number) ? number : 0),
    });
  })();

  function addRequirement() {
    if (requirementValue.trim() === "" || !Number.isFinite(Number(requirementValue))) {
      setPerkError("Renseignez une valeur valide pour la condition.");
      return;
    }
    if (metaForRequirementKind.needsTarget && !requirementTarget && requirementTargetOptions.length === 0) {
      setPerkError("Choisissez ce que cette condition doit vérifier.");
      return;
    }
    const helper = getRequirementValueHelper(requirementKind);
    const num = Number(requirementValue);
    const value = helper.displayToStored(num);
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
    setPerkError(null);
  }
  function removeRequirement(index: number) {
    setPerkRequirements((prev) => prev.filter((_, i) => i !== index));
    setEditingRequirementIndex(null);
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const filteredPerks = perks.filter((perk) =>
    matchesSearchText(perkQuery, [
      perk.name_fr,
      perk.description_fr ?? "",
      categoryById.get(perk.category_id ?? "")?.name_fr ?? "",
      ...(perk.perk_requirements ?? []).map((requirement) => formatRequirementLabel(requirement)),
      ...(perk.perk_effects ?? []).map((effect) =>
        getEffectDescription(effect as ResolvedEffect, {
          rosterUnitName: (id) => rosterUnits.find((unit) => unit.id === id)?.name_fr ?? null,
          countryName: () => null,
        })
      ),
    ])
  );
  const previewIconUrl = perkIconPreviewUrl || perkIconUrl;
  const previewCategory = categoryById.get(perkCategoryId)?.name_fr ?? "Sans catégorie";
  const editedCategory = categories.find((category) => category.id === editingCategoryId);
  const categoryFormDirty = categoryFormOpen && (
    categoryName.trim() !== (editedCategory?.name_fr.trim() ?? "") ||
    categorySortOrder !== (editedCategory?.sort_order ?? categories.length)
  );
  const editedPerk = perks.find((perk) => perk.id === editingPerkId);
  const currentPerkDraft = JSON.stringify({
    name: perkName.trim(),
    description: perkDescription.trim(),
    categoryId: perkCategoryId,
    iconUrl: perkIconUrl.trim(),
    iconFile: perkIconFile ? [perkIconFile.name, perkIconFile.size, perkIconFile.lastModified] : null,
    iconSize: perkIconSize,
    sortOrder: perkSortOrder,
    effects: perkEffects,
    requirements: perkRequirements,
  });
  const savedPerkDraft = JSON.stringify({
    name: editedPerk?.name_fr.trim() ?? "",
    description: editedPerk?.description_fr?.trim() ?? "",
    categoryId: editedPerk?.category_id ?? categories[0]?.id ?? "",
    iconUrl: editedPerk?.icon_url?.trim() ?? "",
    iconFile: null,
    iconSize: editedPerk?.icon_size ?? 48,
    sortOrder: editedPerk?.sort_order ?? perks.length + 1,
    effects: (editedPerk?.perk_effects ?? []).map((effect) => ({
      effect_kind: effect.effect_kind,
      effect_target: effect.effect_target ?? null,
      effect_subtype: effect.effect_subtype ?? null,
      value: Number(effect.value),
    })),
    requirements: (editedPerk?.perk_requirements ?? []).map((requirement) => ({
      requirement_kind: requirement.requirement_kind,
      requirement_target: requirement.requirement_target ?? null,
      value: Number(requirement.value),
    })),
  });
  const editedEffect = editingEffectIndex == null ? null : perkEffects[editingEffectIndex];
  const effectDraftDirty = effectFormOpen && effectValue.trim() !== "" && (
    !editedEffect ||
    !Number.isFinite(Number(effectValue)) ||
    effectKind !== editedEffect.effect_kind ||
    currentEffectTarget !== (editedEffect.effect_target ?? null) ||
    getEffectKindValueHelper(effectKind).displayToStored(Number(effectValue)) !== Number(editedEffect.value)
  );
  const editedRequirement = editingRequirementIndex == null ? null : perkRequirements[editingRequirementIndex];
  const currentRequirementTarget =
    metaForRequirementKind.needsTarget && requirementTargetOptions.length
      ? requirementTarget || requirementTargetOptions[0]?.value || null
      : null;
  const requirementDraftDirty = requirementFormOpen && requirementValue.trim() !== "" && (
    !editedRequirement ||
    !Number.isFinite(Number(requirementValue)) ||
    requirementKind !== editedRequirement.requirement_kind ||
    currentRequirementTarget !== (editedRequirement.requirement_target ?? null) ||
    getRequirementValueHelper(requirementKind).displayToStored(Number(requirementValue)) !==
      Number(editedRequirement.value)
  );
  const perkFormDirty = perkFormOpen && (
    currentPerkDraft !== savedPerkDraft ||
    effectDraftDirty ||
    requirementDraftDirty
  );
  useUnsavedChangesGuard((categoryFormDirty || perkFormDirty) && !saving);

  function canCloseEffectDialog() {
    return !effectDraftDirty || confirm("Fermer sans ajouter cette conséquence ?");
  }

  function closeEffectDialog() {
    setEffectFormOpen(false);
    setEditingEffectIndex(null);
    setEffectError(null);
  }

  function closeCategoryDialog() {
    setCategoryFormOpen(false);
    setEditingCategoryId(null);
    setCategoryError(null);
  }

  function canCloseCategoryDialog() {
    return !categoryFormDirty || confirm("Fermer sans enregistrer cette catégorie ?");
  }

  function closePerkDialog() {
    setPerkFormOpen(false);
    setEditingPerkId(null);
    setPerkError(null);
    setRequirementFormOpen(false);
    closeEffectDialog();
  }

  function canClosePerkDialog() {
    return !perkFormDirty || confirm("Fermer sans enregistrer cet avantage ?");
  }

  return (
    <div className="admin-settings-form space-y-4">
      {operationNotice ? (
        <p
          role={operationNotice.type === "error" ? "alert" : "status"}
          className={`rounded border px-3 py-2 text-sm ${
            operationNotice.type === "error"
              ? "border-[var(--danger)] text-[var(--danger)]"
              : "border-[var(--accent)] text-[var(--accent)]"
          }`}
        >
          {operationNotice.message}
        </p>
      ) : null}
      <div className="grid min-w-0 overflow-hidden rounded-xl border xl:grid-cols-[18rem_minmax(0,1fr)]" style={{ borderColor: "var(--border)" }}>
        <aside id="perk-categories" className="min-w-0 border-b bg-[var(--background-panel)] xl:border-r xl:border-b-0" style={{ borderColor: "var(--border)" }}>
          <header className="flex items-center justify-between gap-3 border-b px-3 py-3" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Catégories</h2>
              <p className="text-xs text-[var(--foreground-muted)]">{categories.length} au total</p>
            </div>
            <button
              type="button"
              onClick={openAddCategory}
              disabled={saving}
              className="min-h-9 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              Ajouter
            </button>
          </header>
          <ul className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
            {categories.map((cat) => (
              <li key={cat.id} className="group flex min-w-0 items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => openEditCategory(cat)}
                  disabled={saving}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--foreground)]">{cat.name_fr}</span>
                    <span className="block text-xs text-[var(--foreground-muted)]">
                      {perks.filter((perk) => perk.category_id === cat.id).length} avantage{perks.filter((perk) => perk.category_id === cat.id).length > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span aria-hidden className="text-lg text-[var(--foreground-muted)] group-hover:text-[var(--accent)]">›</span>
                </button>
              </li>
            ))}
          </ul>
          {categories.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--foreground-muted)]">Aucune catégorie.</p>
          ) : null}
          <AdminDialog
            id="perk-category-dialog"
            open={categoryFormOpen}
            onClose={closeCategoryDialog}
            beforeClose={canCloseCategoryDialog}
            title={editingCategoryId ? "Modifier la catégorie" : "Nouvelle catégorie"}
            busy={saving}
            size="sm"
            actions={(
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                {editingCategoryId ? (
                  <button
                    type="button"
                    onClick={() => setPendingDelete({
                      kind: "category",
                      id: editingCategoryId,
                      name: categoryName.trim() || "cette catégorie",
                    })}
                    disabled={saving}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Supprimer la catégorie
                  </button>
                ) : <span />}
                <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (canCloseCategoryDialog()) closeCategoryDialog();
                  }}
                  disabled={saving}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveCategory}
                  disabled={saving}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                </div>
              </div>
            )}
          >
            <fieldset disabled={saving} aria-busy={saving || undefined} className="space-y-4">
              {categoryError && <p role="alert" className="text-sm text-[var(--danger)]">{categoryError}</p>}
              <div>
                <label htmlFor="perk-category-name" className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  id="perk-category-name"
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="max-w-40">
                <label htmlFor="perk-category-order" className="mb-1 block text-sm font-medium text-[var(--foreground)]">Position</label>
                <input
                  id="perk-category-order"
                  type="number"
                  value={categorySortOrder}
                  onChange={(e) => setCategorySortOrder(Number(e.target.value) || 0)}
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">Les plus petits nombres apparaissent en premier.</p>
              </div>
            </fieldset>
          </AdminDialog>
        </aside>

        <section id="perk-list" className="min-w-0 bg-[var(--background-panel)]">
          <header className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Avantages</h2>
              <p className="text-xs text-[var(--foreground-muted)]">
                {filteredPerks.length} sur {perks.length}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row">
              <label htmlFor="perk-search" className="sr-only">Rechercher un avantage</label>
              <input
                id="perk-search"
                type="search"
                value={perkQuery}
                onChange={(event) => setPerkQuery(event.target.value)}
                placeholder="Rechercher…"
                className={`${inputClass} min-h-10`}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={openAddPerk}
                disabled={saving}
                className="min-h-10 shrink-0 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Nouvel avantage
              </button>
            </div>
          </header>
          <ul className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
            {filteredPerks.map((p) => {
              const requirementCount = p.perk_requirements?.length ?? 0;
              const effectCount = p.perk_effects?.length ?? 0;
              return (
                <li key={p.id} className="group flex min-w-0 items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => openEditPerk(p)}
                    disabled={saving}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--background)] text-[var(--foreground-muted)]">
                      {p.icon_url ? <img src={p.icon_url} alt="" className="h-full w-full object-contain" /> : <span aria-hidden>★</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{p.name_fr}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--foreground-muted)]">
                        <span>{categoryById.get(p.category_id ?? "")?.name_fr ?? "Sans catégorie"}</span>
                        <span>{requirementCount ? `${requirementCount} condition${requirementCount > 1 ? "s" : ""}` : "Accès libre"}</span>
                        <span className={effectCount ? "text-[var(--accent)]" : "text-[var(--warning)]"}>
                          {effectCount ? `${effectCount} effet${effectCount > 1 ? "s" : ""}` : "Aucun effet"}
                        </span>
                      </span>
                    </span>
                    <span aria-hidden className="text-lg text-[var(--foreground-muted)] group-hover:text-[var(--accent)]">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        {filteredPerks.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">
            Aucun avantage ne correspond à cette recherche.
          </p>
        )}
          <AdminDialog
            id="perk-editor-dialog"
            open={perkFormOpen}
            onClose={closePerkDialog}
            beforeClose={canClosePerkDialog}
            title={editingPerkId ? "Modifier l’avantage" : "Nouvel avantage"}
            description="Le résumé joueur se met à jour avant l’enregistrement."
            busy={saving}
            size="lg"
            actions={(
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                {editingPerkId ? (
                  <button
                    type="button"
                    onClick={() => setPendingDelete({
                      kind: "perk",
                      id: editingPerkId,
                      name: perkName.trim() || "cet avantage",
                    })}
                    disabled={saving}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Supprimer l’avantage
                  </button>
                ) : <span />}
                <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (canClosePerkDialog()) closePerkDialog();
                  }}
                  disabled={saving}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={savePerk}
                  disabled={saving}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : editingPerkId ? "Enregistrer" : "Créer l’avantage"}
                </button>
                </div>
              </div>
            )}
          >
          <fieldset disabled={saving} aria-busy={saving || undefined} className="min-w-0 space-y-5">
            {perkError && <p role="alert" className="text-sm text-[var(--danger)]">{perkError}</p>}
            <AdminImpactPreview
              title="Aperçu joueur, avant enregistrement"
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[var(--background)] text-xl text-[var(--foreground-muted)]"
                  style={{
                    borderColor: "var(--border-muted)",
                    width: Math.min(72, perkIconSize),
                    height: Math.min(72, perkIconSize),
                  }}
                >
                  {previewIconUrl ? (
                    <img src={previewIconUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span aria-hidden>★</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">{previewCategory}</p>
                  <p className="mt-1 break-words text-base font-semibold text-[var(--foreground)]">
                    {perkName.trim() || "Nom de l’avantage"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {perkDescription.trim() || "La description visible par les joueurs apparaîtra ici."}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2" style={{ borderColor: "var(--border-muted)" }}>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]">Pour le débloquer</p>
                  {perkRequirements.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                      {perkRequirements.map((requirement, index) => (
                        <li key={index}>✓ {formatRequirementLabel(requirement)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--warning)]">Aucune condition : l’avantage est accessible sans seuil.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]">Ce qu’il change</p>
                  {perkEffects.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                      {perkEffects.map((effect, index) => (
                        <li key={index}>
                          → {getEffectDescription(effect as ResolvedEffect, {
                            rosterUnitName: (id) => rosterUnits.find((unit) => unit.id === id)?.name_fr ?? null,
                            countryName: () => null,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--warning)]">Aucun effet : le déblocage n’aura aucune conséquence en jeu.</p>
                  )}
                </div>
              </div>
            </AdminImpactPreview>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="perk-title" className="mb-1 block text-xs text-[var(--foreground-muted)]">Nom de l’avantage</label>
                <input
                  id="perk-title"
                  type="text"
                  value={perkName}
                  onChange={(e) => setPerkName(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="perk-category" className="mb-1 block text-xs text-[var(--foreground-muted)]">Catégorie</label>
                <select
                  id="perk-category"
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
              <label htmlFor="perk-description" className="mb-1 block text-xs text-[var(--foreground-muted)]">Description visible par les joueurs</label>
              <textarea
                id="perk-description"
                value={perkDescription}
                onChange={(e) => setPerkDescription(e.target.value)}
                rows={2}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-[var(--foreground-muted)]">Icône</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0">
                  <label htmlFor="perk-icon-file" className="sr-only">Fichier de l’icône</label>
                  <input
                    id="perk-icon-file"
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
                    Importez une image ou renseignez une adresse ci-contre.
                  </p>
                </div>
                <div className="min-w-[12rem] flex-1">
                  <label htmlFor="perk-icon-url" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">ou adresse de l’image</label>
                  <input
                    id="perk-icon-url"
                    type="text"
                    value={perkIconUrl}
                    onChange={(e) => { setPerkIconUrl(e.target.value); setPerkIconFile(null); }}
                    placeholder="https://..."
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="perk-icon-size" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Taille d’affichage (pixels)</label>
                  <input
                    id="perk-icon-size"
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
              {(perkIconPreviewUrl || perkIconUrl) && (
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={perkIconPreviewUrl || perkIconUrl || ""}
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
                <label htmlFor="perk-order" className="mb-1 block text-xs text-[var(--foreground-muted)]">Ordre d’affichage (plus petit en premier)</label>
                <input
                  id="perk-order"
                  type="number"
                  value={perkSortOrder}
                  onChange={(e) => setPerkSortOrder(Number(e.target.value) || 0)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Conditions de déblocage</p>
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
                    setEditingRequirementIndex(null);
                    const kind = ALL_REQUIREMENT_KIND_IDS[0];
                    setRequirementKind(kind);
                    const meta = REQUIREMENT_KIND_META[kind];
                    setRequirementTarget(meta.targetOptions?.[0]?.value ?? "");
                    setRequirementValue("");
                  }}
                  className="mt-1 text-sm text-[var(--accent)] hover:underline"
                >
                  Ajouter une condition
                </button>
              ) : (
                <div className="mt-2 grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: "var(--border-muted)" }}>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      {editingRequirementIndex == null ? "Ajouter une condition" : "Modifier la condition"}
                    </h3>
                    <p className="mt-1 rounded border px-3 py-2 text-sm font-medium text-[var(--foreground)]" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                      {requirementPreviewLabel}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="perk-requirement-kind" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Condition</label>
                    <select
                      id="perk-requirement-kind"
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
                      <label htmlFor="perk-requirement-target" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{metaForRequirementKind.targetLabel ?? "Cible"}</label>
                      <select
                        id="perk-requirement-target"
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
                    <label htmlFor="perk-requirement-value" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getRequirementValueHelper(requirementKind).valueLabel}</label>
                    <input
                      id="perk-requirement-value"
                      type="number"
                      step={getRequirementValueHelper(requirementKind).valueStep}
                      value={requirementValue}
                      onChange={(e) => setRequirementValue(e.target.value)}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                    <button type="button" onClick={addRequirement} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>
                      {editingRequirementIndex == null ? "Ajouter à l’avantage" : "Enregistrer la modification"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequirementFormOpen(false);
                        setEditingRequirementIndex(null);
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

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Effets appliqués</p>
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
                          setEffectError(null);
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
              <button
                type="button"
                onClick={() => {
                  setEffectFormOpen(true);
                  setEditingEffectIndex(null);
                  setEffectKind(getEffectKindOptionGroups()[0]?.options[0]?.id ?? "gdp_growth_base");
                  setEffectTarget(null);
                  setEffectValue("");
                  setEffectError(null);
                }}
                className="mt-2 rounded-lg border px-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--background-elevated)]"
                style={{ borderColor: "var(--border)" }}
              >
                Ajouter un effet
              </button>
              <AdminDialog
                id="perk-effect-dialog"
                open={effectFormOpen}
                onClose={closeEffectDialog}
                beforeClose={canCloseEffectDialog}
                title={editingEffectIndex == null ? "Ajouter un effet" : "Modifier l’effet"}
                description="La conséquence ci-dessous sera ajoutée à l’avantage en cours."
                size="md"
                actions={
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (canCloseEffectDialog()) closeEffectDialog();
                      }}
                      className="rounded-lg border px-3 text-sm font-medium"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={addEffect}
                      disabled={!effectCanSubmit}
                      className="rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {editingEffectIndex == null ? "Ajouter à l’avantage" : "Enregistrer"}
                    </button>
                  </div>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="mt-2 rounded border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                      <p className="text-xs text-[var(--foreground-muted)]">Visible dans la fiche de l’avantage</p>
                      <p className="mt-0.5 font-medium text-[var(--foreground)]">{effectPreviewLabel}</p>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="perk-effect-kind" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Conséquence</label>
                    <select
                      id="perk-effect-kind"
                      value={effectKind}
                      onChange={(e) => {
                        const k = e.target.value;
                        setEffectKind(k);
                        setEffectTarget(getDefaultTargetForKind(k, rosterUnitIds, undefined, subTypeOptions.map((o) => o.value)));
                        setEffectError(null);
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
                      <label htmlFor="perk-effect-stat" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Statistique concernée</label>
                      <select
                        id="perk-effect-stat"
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
                      <label htmlFor="perk-effect-ministry" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère concerné</label>
                      <select
                        id="perk-effect-ministry"
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
                      <label htmlFor="perk-effect-branch" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche concernée</label>
                      <select
                        id="perk-effect-branch"
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
                      <label htmlFor="perk-effect-unit" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité concernée</label>
                      <select
                        id="perk-effect-unit"
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
                      <label htmlFor="perk-effect-subtype" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d’unité concerné</label>
                      <select
                        id="perk-effect-subtype"
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
                    <label htmlFor="perk-effect-value" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                      {getEffectKindValueHelper(effectKind).valueLabel}
                    </label>
                    <input
                      id="perk-effect-value"
                      type="number"
                      step={getEffectKindValueHelper(effectKind).valueStep}
                      value={effectValue}
                      onChange={(e) => {
                        setEffectValue(e.target.value);
                        setEffectError(null);
                      }}
                      className={inputClass}
                      style={{ ...inputStyle, maxWidth: "12rem" }}
                    />
                  </div>
                  {effectError ? (
                    <p role="alert" className="sm:col-span-2 text-sm text-[var(--danger)]">{effectError}</p>
                  ) : null}
                </div>
              </AdminDialog>
            </div>

          </fieldset>
          </AdminDialog>
        </section>
      </div>

      <AdminConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={
          pendingDelete?.kind === "category"
            ? `Supprimer « ${pendingDelete.name} » ?`
            : `Supprimer « ${pendingDelete?.name ?? ""} » ?`
        }
        consequence={
          pendingDelete?.kind === "category"
            ? "Les avantages resteront disponibles, mais ils ne seront plus rattachés à cette catégorie."
            : "L’avantage et ses conditions seront supprimés. Cette opération est irréversible."
        }
        confirmLabel={pendingDelete?.kind === "category" ? "Supprimer la catégorie" : "Supprimer l’avantage"}
        danger
        busy={saving}
        onConfirm={() => {
          if (!pendingDelete) return;
          const deletion = pendingDelete.kind === "category"
            ? handleDeleteCategory(pendingDelete.id)
            : handleDeletePerk(pendingDelete.id);
          void deletion.finally(() => setPendingDelete(null));
        }}
      />
    </div>
  );
}
