"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPlayer, assignPlayer, deletePlayer, updatePlayerName, addStateActions } from "./actions";
import { AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";
import { matchesSearchText } from "@/lib/searchText";

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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredPlayers = useMemo(
    () => players.filter((player) =>
      matchesSearchText(query, [player.name ?? "", player.email, player.countryName])
    ),
    [players, query]
  );

  return (
    <div className="admin-settings-form space-y-5">
      <AdminSettingsGuide
        purpose="Chaque compte joueur donne accès à un seul pays."
        impact="Le joueur peut ouvrir les espaces privés de son pays et utiliser son solde de points d’action."
        check="Vérifiez l’email et le pays avant la création. Un changement d’assignation prend effet dès la prochaine navigation du joueur."
        warning="Supprimer un joueur détruit aussi son compte de connexion. Cette action n’est pas réversible."
      />

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Créer un joueur
        </h2>
        <p className="mb-3 mt-1 text-sm text-[var(--foreground-muted)]">
          Crée le compte de connexion et l’assigne au pays choisi en une seule opération.
        </p>
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
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-5"
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
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Joueurs assignés</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              {players.length} compte{players.length > 1 ? "s" : ""} actif{players.length > 1 ? "s" : ""}.
            </p>
          </div>
          <label className="w-full sm:max-w-xs">
            <span className="sr-only">Rechercher un joueur</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, email ou pays…"
              className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        </div>
        {(assignError || nameError || addActionsError) && (
          <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{assignError || nameError || addActionsError}</p>
        )}
        {actionSuccess && <p role="status" className="mb-2 text-sm text-[var(--accent)]">{actionSuccess}</p>}
        {players.length === 0 ? (
          <p className="text-[var(--foreground-muted)]">Aucun joueur.</p>
        ) : filteredPlayers.length === 0 ? (
          <p className="rounded-lg border px-4 py-8 text-center text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>
            Aucun joueur ne correspond à cette recherche.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredPlayers.map((p) => (
              <li
                key={p.user_id}
                className="flex flex-col items-stretch gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center"
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
                    setActionSuccess(null);
                    setAddingActionsCountryId(p.country_id);
                    const result = await addStateActions(p.country_id, 25);
                    setAddingActionsCountryId(null);
                    if (result.error) setAddActionsError(result.error);
                    else {
                      setActionSuccess(`25 points d’action ajoutés à ${p.countryName}.`);
                      router.refresh();
                    }
                  }}
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--accent)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                >
                  {addingActionsCountryId === p.country_id ? "Ajout…" : "Ajouter 25 PA"}
                </button>
                <form
                  action={async () => {
                    if (!confirm("Supprimer ce joueur ? Son compte sera supprimé.")) return;
                    setActionSuccess(null);
                    const result = await deletePlayer(p.user_id);
                    if (result.error) setAssignError(result.error);
                    else {
                      setActionSuccess("Joueur supprimé.");
                      router.refresh();
                    }
                  }}
                  className="sm:ml-auto"
                >
                  <button
                    type="submit"
                    className="min-h-11 rounded-lg px-2 text-sm text-[var(--danger)] hover:bg-[var(--background-elevated)]"
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
