"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPlayer, assignPlayer, deletePlayer, updatePlayerName, addStateActions } from "./actions";

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
  const [addingActionsCountryId, setAddingActionsCountryId] = useState<string | null>(null);
  const [addActionsError, setAddActionsError] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section
        className="rounded-xl border p-4 sm:p-6"
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
          className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          <div className="min-w-0">
            <label htmlFor="new-player-name" className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom</label>
            <input
              id="new-player-name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="ex. kapkio"
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="new-player-email" className="mb-1 block text-sm text-[var(--foreground-muted)]">Email</label>
            <input
              id="new-player-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="new-player-password" className="mb-1 block text-sm text-[var(--foreground-muted)]">Mot de passe</label>
            <input
              id="new-player-password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={6}
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="new-player-country" className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays</label>
            <select
              id="new-player-country"
              name="country_id"
              required
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
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
            className="w-full rounded px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            Créer le joueur
          </button>
        </form>
        {createError && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{createError}</p>}
        {createSuccess && (
          <p role="status" className="mt-2 text-sm text-[var(--accent)]">
            {typeof createSuccess === "string" ? createSuccess : "Joueur créé."}
          </p>
        )}
      </section>

      <section
        className="rounded-xl border p-4 sm:p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Joueurs assignés
        </h2>
        {(assignError || nameError || addActionsError) && (
          <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{assignError || nameError || addActionsError}</p>
        )}
        {players.length === 0 ? (
          <p className="text-[var(--foreground-muted)]">Aucun joueur.</p>
        ) : (
          <ul className="space-y-3">
            {players.map((p) => (
              <li
                key={p.user_id}
                className="flex flex-col items-stretch gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center"
                style={{ borderColor: "var(--border-muted)" }}
              >
                {editingNameId === p.user_id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    action={async (formData) => {
                      setNameError(null);
                      const result = await updatePlayerName(p.user_id, (formData.get("name") as string) || null);
                      setEditingNameId(null);
                      if (result.error) setNameError(result.error);
                      else router.refresh();
                    }}
                  >
                    <label htmlFor={`player-name-${p.user_id}`} className="sr-only">
                      Nom du joueur
                    </label>
                    <input
                      id={`player-name-${p.user_id}`}
                      type="text"
                      name="name"
                      autoComplete="name"
                      defaultValue={p.name ?? ""}
                      placeholder="Nom"
                      className="min-w-0 flex-1 rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] sm:w-40 sm:flex-none"
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
                <span className="hidden text-[var(--foreground-muted)] sm:inline">—</span>
                <span className="break-words text-sm text-[var(--foreground-muted)] [overflow-wrap:anywhere]">{p.email}</span>
                <span className="hidden text-[var(--foreground-muted)] sm:inline">→</span>
                <form
                  className="flex min-w-0 items-center gap-2"
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
                    aria-label={`Pays assigné à ${p.name || p.email}`}
                    defaultValue={p.country_id}
                    disabled={!!assigningId}
                    className="min-w-0 flex-1 rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] sm:flex-none"
                    style={{ borderColor: "var(--border)" }}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  >
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {assigningId === p.user_id && <span className="text-xs text-[var(--foreground-muted)]">…</span>}
                </form>
                <button
                  type="button"
                  disabled={addingActionsCountryId !== null}
                  onClick={async () => {
                    setAddActionsError(null);
                    setAddingActionsCountryId(p.country_id);
                    const result = await addStateActions(p.country_id, 25);
                    setAddingActionsCountryId(null);
                    if (result.error) setAddActionsError(result.error);
                    else router.refresh();
                  }}
                  className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  {addingActionsCountryId === p.country_id ? "…" : "Ajouter actions"}
                </button>
                <form
                  action={async () => {
                    if (!confirm("Supprimer ce joueur ? Son compte sera supprimé.")) return;
                    await deletePlayer(p.user_id);
                    router.refresh();
                  }}
                  className="sm:ml-auto"
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
