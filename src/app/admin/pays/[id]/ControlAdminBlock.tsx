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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSharePct, setEditSharePct] = useState("");
  const [editIsAnnexed, setEditIsAnnexed] = useState(false);

  const status = deriveStatus(controls);
  const availableCountries = otherCountries.filter(
    (c) => c.id !== countryId && !controls.some((r) => r.controller_country_id === c.id)
  );

  async function handleAdd() {
    if (!newControllerId.trim()) return;
    setError(null);
    setSaving(true);
    const result = await upsertCountryControl(
      countryId,
      newControllerId,
      Number(newSharePct) || 0,
      newIsAnnexed
    );
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setNewControllerId("");
      setNewSharePct("100");
      setNewIsAnnexed(false);
      router.refresh();
    }
  }

  async function handleUpdate(row: ControlRow) {
    setError(null);
    setSaving(true);
    const result = await updateCountryControl(
      row.id,
      countryId,
      Number(editSharePct) || 0,
      editIsAnnexed
    );
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setEditingId(null);
      router.refresh();
    }
  }

  async function handleDelete(controlId: string) {
    setError(null);
    setSaving(true);
    const result = await deleteCountryControl(controlId, countryId);
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setEditingId(null);
      router.refresh();
    }
  }

  function startEdit(row: ControlRow) {
    setEditingId(row.id);
    setEditSharePct(String(row.share_pct));
    setEditIsAnnexed(row.is_annexed);
  }

  const panelStyle = {
    background: "var(--background-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  };
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <div className="rounded-lg border p-6" style={panelStyle}>
      <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
        Contrôle
      </h2>
      <p className="mb-4 text-sm text-[var(--foreground-muted)]">
        Parts détenues par d&apos;autres pays sur ce pays. Statut dérivé : <strong className="text-[var(--foreground)]">{status}</strong>.
      </p>

      <ul className="mb-6 space-y-2">
        {controls.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 rounded border py-2 px-3"
            style={{ borderColor: "var(--border-muted)" }}
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
                  className="w-16 rounded border bg-[var(--background)] px-1.5 py-0.5 text-sm font-mono"
                  style={inputStyle}
                />
                <span className="text-sm text-[var(--foreground-muted)]">%</span>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={editIsAnnexed}
                    onChange={(e) => setEditIsAnnexed(e.target.checked)}
                  />
                  Annexé
                </label>
                <button
                  type="button"
                  onClick={() => handleUpdate(row)}
                  disabled={saving}
                  className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-sm text-[var(--foreground-muted)] hover:underline"
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
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  disabled={saving}
                  className="text-sm text-[var(--danger)] hover:underline disabled:opacity-50"
                >
                  Supprimer
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {availableCountries.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
          <div>
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ajouter un contrôleur</label>
            <select
              value={newControllerId}
              onChange={(e) => setNewControllerId(e.target.value)}
              className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] min-w-[180px]"
              style={inputStyle}
            >
              <option value="">— Choisir un pays —</option>
              {availableCountries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Part %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={newSharePct}
              onChange={(e) => setNewSharePct(e.target.value)}
              className="w-16 rounded border bg-[var(--background)] px-1.5 py-1.5 text-sm font-mono"
              style={inputStyle}
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)]">
            <input
              type="checkbox"
              checked={newIsAnnexed}
              onChange={(e) => setNewIsAnnexed(e.target.checked)}
            />
            Annexé
          </label>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !newControllerId}
            className="rounded py-1.5 px-3 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            Ajouter
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
