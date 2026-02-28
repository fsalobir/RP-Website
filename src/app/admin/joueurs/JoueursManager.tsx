"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPlayer, assignPlayer, deletePlayer, updatePlayerName } from "./actions";

type PlayerRow = {
  user_id: string;
  country_id: string;
  email: string;
  name: string | null;
  created_at: string;
  countryName: string;
};

type Country = { id: string; name: string; slug: string };

export function JoueursManager({
  players,
  countries,
}: {
  players: PlayerRow[];
  countries: Country[];
}) {
  const router = useRouter();
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<boolean | string>(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Créer un joueur
        </h2>
        <form
          action={async (formData) => {
            setCreateError(null);
            setCreateSuccess(false);
            const result = await createPlayer(formData);
            if (result.error) {
              setCreateError(result.error);
              return;
            }
            setCreateSuccess(result.existingAssigned ? "Compte existant assigné au pays." : true);
            router.refresh();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom</label>
            <input
              type="text"
              name="name"
              placeholder="ex. kapkio"
              className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Email</label>
            <input
              type="email"
              name="email"
              required
              className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Mot de passe</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays</label>
            <select
              name="country_id"
              required
              className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">— Choisir —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded py-2 px-4 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            Créer le joueur
          </button>
        </form>
        {createError && <p className="mt-2 text-sm text-[var(--danger)]">{createError}</p>}
        {createSuccess && (
          <p className="mt-2 text-sm text-[var(--accent)]">
            {typeof createSuccess === "string" ? createSuccess : "Joueur créé."}
          </p>
        )}
      </section>

      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Joueurs assignés
        </h2>
        {(assignError || nameError) && <p className="mb-2 text-sm text-[var(--danger)]">{assignError || nameError}</p>}
        {players.length === 0 ? (
          <p className="text-[var(--foreground-muted)]">Aucun joueur.</p>
        ) : (
          <ul className="space-y-3">
            {players.map((p) => (
              <li
                key={p.user_id}
                className="flex flex-wrap items-center gap-4 rounded border py-2 px-3"
                style={{ borderColor: "var(--border-muted)" }}
              >
                {editingNameId === p.user_id ? (
                  <form
                    className="flex items-center gap-2"
                    action={async (formData) => {
                      setNameError(null);
                      const result = await updatePlayerName(p.user_id, (formData.get("name") as string) || null);
                      setEditingNameId(null);
                      if (result.error) setNameError(result.error);
                      else router.refresh();
                    }}
                  >
                    <input
                      type="text"
                      name="name"
                      defaultValue={p.name ?? ""}
                      placeholder="Nom"
                      className="w-32 rounded border bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <button type="submit" className="text-sm text-[var(--accent)] hover:underline">OK</button>
                    <button type="button" onClick={() => setEditingNameId(null)} className="text-sm text-[var(--foreground-muted)] hover:underline">Annuler</button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingNameId(p.user_id)}
                    className="text-left font-medium text-[var(--foreground)] hover:underline"
                  >
                    {p.name ? p.name : <span className="text-[var(--foreground-muted)]">(sans nom)</span>}
                  </button>
                )}
                <span className="text-[var(--foreground-muted)]">—</span>
                <span className="text-sm text-[var(--foreground-muted)]">{p.email}</span>
                <span className="text-[var(--foreground-muted)]">→</span>
                <form
                  className="flex items-center gap-2"
                  action={async (formData) => {
                    setAssignError(null);
                    setAssigningId(p.user_id);
                    const result = await assignPlayer(
                      p.user_id,
                      formData.get("country_id") as string
                    );
                    setAssigningId(null);
                    if (result.error) setAssignError(result.error);
                    else router.refresh();
                  }}
                >
                  <select
                    name="country_id"
                    defaultValue={p.country_id}
                    disabled={!!assigningId}
                    className="rounded border bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  >
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {assigningId === p.user_id && <span className="text-xs text-[var(--foreground-muted)]">…</span>}
                </form>
                <form
                  action={async () => {
                    if (!confirm("Supprimer ce joueur ? Son compte sera supprimé.")) return;
                    await deletePlayer(p.user_id);
                    router.refresh();
                  }}
                  className="ml-auto"
                >
                  <button
                    type="submit"
                    className="text-sm text-[var(--danger)] hover:underline"
                  >
                    Supprimer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
