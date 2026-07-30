"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCountryControl, updateCountryControl, deleteCountryControl } from "./actions";

type ControlRow = {
  id: string;
  controller_country_id: string;
  controller_name: string;
  share_pct: number;
  is_annexed: boolean;
  updated_at: string;
};

function deriveStatus(controls: ControlRow[]): "Souverain" | "Contesté" | "Occupé" | "Annexé" {
  if (controls.length === 0) return "Souverain";
  if (controls.length === 1 && controls[0].share_pct >= 100) {
    return controls[0].is_annexed ? "Annexé" : "Occupé";
  }
  return "Contesté";
}

export function ControlAdminBlock({
  countryId,
  controls,
  otherCountries,
}: {
  countryId: string;
  controls: ControlRow[];
  otherCountries: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [newControllerId, setNewControllerId] = useState("");
  const [newSharePct, setNewSharePct] = useState("100");
  const [newIsAnnexed, setNewIsAnnexed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSharePct, setEditSharePct] = useState("");
  const [editIsAnnexed, setEditIsAnnexed] = useState(false);

  const status = deriveStatus(controls);
  const totalShare = controls.reduce((sum, row) => sum + Number(row.share_pct || 0), 0);
  const newShareValue = Number(newSharePct);
  const availableCountries = otherCountries.filter(
    (c) => c.id !== countryId && !controls.some((r) => r.controller_country_id === c.id)
  );

  async function handleAdd() {
    if (!newControllerId.trim()) return;
    if (!Number.isFinite(newShareValue) || newShareValue < 0 || newShareValue > 100) {
      setError("La part de contrôle doit être comprise entre 0 et 100 %.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await upsertCountryControl(
        countryId,
        newControllerId,
        Number(newSharePct) || 0,
        newIsAnnexed
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewControllerId("");
      setNewSharePct("100");
      setNewIsAnnexed(false);
      setSuccess("Contrôle ajouté.");
      router.refresh();
    } catch {
      setError("Impossible d’ajouter ce contrôle. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(row: ControlRow) {
    const editValue = Number(editSharePct);
    if (!Number.isFinite(editValue) || editValue < 0 || editValue > 100) {
      setError("La part de contrôle doit être comprise entre 0 et 100 %.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await updateCountryControl(
        row.id,
        countryId,
        Number(editSharePct) || 0,
        editIsAnnexed,
        row.updated_at
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setSuccess("Contrôle mis à jour.");
      router.refresh();
    } catch {
      setError("Impossible de modifier ce contrôle. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ControlRow) {
    const { id: controlId, controller_name: controllerName, updated_at: expectedUpdatedAt } = row;
    if (!confirm(`Supprimer le contrôle exercé par ${controllerName} ?`)) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await deleteCountryControl(controlId, countryId, expectedUpdatedAt);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setSuccess(`Contrôle exercé par ${controllerName} supprimé.`);
      router.refresh();
    } catch {
      setError(`Impossible de supprimer le contrôle exercé par ${controllerName}. Vérifiez votre connexion puis réessayez.`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ControlRow) {
    setEditingId(row.id);
    setEditSharePct(String(row.share_pct));
    setEditIsAnnexed(row.is_annexed);
  }

  const inputStyle = { borderColor: "var(--border)" };

  return (
    <div className="admin-settings-form border-y" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Contrôle territorial</h2>
          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Les parts déterminent le statut public du pays.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-lg bg-[var(--background-elevated)] px-2.5 py-1 font-semibold text-[var(--foreground)]">{status}</span>
          <span className="text-[var(--foreground-muted)]">{totalShare} % contrôlé</span>
        </div>
      </div>
      {controls.length === 0 ? (
        <p className="border-t py-4 text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>Aucun autre pays ne contrôle ce territoire.</p>
      ) : (
      <ul className="divide-y border-t" style={{ borderColor: "var(--border-muted)" }}>
        {controls.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 py-2"
          >
            <span className="font-medium text-[var(--foreground)]">{row.controller_name}</span>
            {editingId === row.id ? (
              <>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editSharePct}
                  onChange={(e) => setEditSharePct(e.target.value)}
                  aria-label={`Part contrôlée par ${row.controller_name}, en pourcentage`}
                  className="min-h-11 w-20 rounded-lg border bg-[var(--background)] px-2 text-base"
                  style={inputStyle}
                />
                <span className="text-sm text-[var(--foreground-muted)]">%</span>
                <label className="flex min-h-11 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={editIsAnnexed}
                    onChange={(e) => setEditIsAnnexed(e.target.checked)}
                  />
                  Considérer comme annexé
                </label>
                <button
                  type="button"
                  onClick={() => handleUpdate(row)}
                  disabled={
                    saving ||
                    !Number.isFinite(Number(editSharePct)) ||
                    Number(editSharePct) < 0 ||
                    Number(editSharePct) > 100
                  }
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--accent)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-[var(--foreground-muted)]">
                  {row.share_pct} %{row.is_annexed ? " (Annexé)" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--accent)] hover:bg-[var(--background-elevated)]"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  disabled={saving}
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--danger)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                >
                  Supprimer
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      )}

      {availableCountries.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t py-3" style={{ borderColor: "var(--border-muted)" }}>
          <div className="w-full min-w-0 sm:w-auto">
            <label htmlFor="new-controller" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ajouter un contrôleur</label>
            <select
              id="new-controller"
              value={newControllerId}
              onChange={(e) => setNewControllerId(e.target.value)}
              className="w-full min-w-0 max-w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] sm:w-auto sm:min-w-[180px]"
              style={inputStyle}
            >
              <option value="">— Choisir un pays —</option>
              {availableCountries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-controller-share" className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Part contrôlée (%)</label>
            <input
              id="new-controller-share"
              type="number"
              min={0}
              max={100}
              value={newSharePct}
              onChange={(e) => setNewSharePct(e.target.value)}
              className="min-h-11 w-20 rounded-lg border bg-[var(--background)] px-2 text-base"
              style={inputStyle}
            />
          </div>
          <label className="flex min-h-11 items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
            <input
              type="checkbox"
              checked={newIsAnnexed}
              onChange={(e) => setNewIsAnnexed(e.target.checked)}
            />
            Considérer comme annexé
          </label>
          <button
            type="button"
            onClick={handleAdd}
            disabled={
              saving ||
              !newControllerId ||
              !Number.isFinite(newShareValue) ||
              newShareValue < 0 ||
              newShareValue > 100
            }
            className="min-h-11 rounded-lg px-3 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            Ajouter le contrôle
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      {success && <p className="mt-3 text-sm text-[var(--accent)]" role="status">{success}</p>}
    </div>
  );
}
