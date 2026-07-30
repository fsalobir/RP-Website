"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { matchesSearchText } from "@/lib/searchText";
import {
  addStateActions,
  assignPlayer,
  createPlayer,
  deletePlayer,
  updatePlayerName,
} from "./actions";

type PlayerRow = {
  user_id: string;
  country_id: string;
  email: string;
  name: string | null;
  created_at: string;
  countryName: string;
};

type Country = { id: string; name: string; slug: string };
type PlayerConfirmation = {
  kind: "points" | "delete";
  player: PlayerRow;
} | null;

const inputClass =
  "min-h-10 w-full rounded-lg border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] disabled:opacity-50";

export function JoueursManager({
  players,
  countries,
}: {
  players: PlayerRow[];
  countries: Country[];
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    action: string;
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [countryDrafts, setCountryDrafts] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<PlayerConfirmation>(null);

  useEffect(() => {
    setCountryDrafts((drafts) => {
      const next = { ...drafts };
      let changed = false;
      for (const player of players) {
        if (next[player.user_id] === player.country_id) {
          delete next[player.user_id];
          changed = true;
        }
      }
      return changed ? next : drafts;
    });
  }, [players]);

  const filteredPlayers = useMemo(
    () =>
      players.filter((player) =>
        matchesSearchText(query, [player.name ?? "", player.email, player.countryName])
      ),
    [players, query]
  );

  function closeCreateDialog() {
    createFormRef.current?.reset();
    setCreateOpen(false);
    setCreateDirty(false);
    setCreateError(null);
  }

  function canCloseCreateDialog() {
    if (pendingAction === "create") return false;
    return !createDirty || confirm("Fermer sans créer ce joueur ?");
  }

  async function applyConfirmedAction() {
    if (!confirmation || pendingAction) return;
    const { kind, player } = confirmation;
    const action = `${kind}:${player.user_id}`;
    setPendingAction(action);
    setFeedback(null);
    try {
      if (kind === "points") {
        const result = await addStateActions(player.country_id, 25);
        setFeedback(
          result.error
            ? { action, type: "error", message: result.error }
            : {
                action,
                type: "success",
                message: `25 points d’action ajoutés à ${player.countryName}.`,
              }
        );
        if (!result.error) router.refresh();
      } else {
        const result = await deletePlayer(player.user_id);
        if (result.error) {
          setFeedback({ action, type: "error", message: result.error });
        } else {
          setNotice("Joueur supprimé.");
          router.refresh();
        }
      }
    } catch {
      setFeedback({
        action,
        type: "error",
        message:
          kind === "points"
            ? "Impossible d’ajouter les points d’action."
            : "Impossible de supprimer le joueur.",
      });
    } finally {
      setPendingAction(null);
      setConfirmation(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Joueurs</h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {players.length} compte{players.length > 1 ? "s" : ""} actif{players.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
          className="min-h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)]"
        >
          Créer un joueur
        </button>
      </header>

      {notice ? (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm text-[var(--accent)]" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}>
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="players-list-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="players-list-title" className="text-lg font-semibold text-[var(--foreground)]">
            Comptes actifs
          </h2>
          <label className="w-full sm:w-72">
            <span className="sr-only">Rechercher un joueur</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, email ou pays…"
              className={inputClass}
            />
          </label>
        </div>

        {players.length === 0 ? (
          <div className="border-y py-10 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm text-[var(--foreground-muted)]">Aucun joueur créé.</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Créer le premier compte
            </button>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <p className="border-y py-10 text-center text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
            Aucun résultat.
          </p>
        ) : (
          <div role="table" aria-label="Joueurs assignés" className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <div
              role="row"
              className="hidden grid-cols-[minmax(12rem,1fr)_minmax(13rem,1.1fr)_auto] gap-4 border-b bg-[var(--background-elevated)] px-4 py-2 text-xs font-medium text-[var(--foreground-muted)] lg:grid"
              style={{ borderColor: "var(--border)" }}
            >
              <span role="columnheader">Compte</span>
              <span role="columnheader">Pays attribué</span>
              <span role="columnheader" className="text-right">Actions</span>
            </div>
            <ul role="rowgroup" className="divide-y divide-[var(--border-muted)]">
              {filteredPlayers.map((player) => {
                const nameAction = `name:${player.user_id}`;
                const assignAction = `assign:${player.user_id}`;
                const pointsAction = `points:${player.user_id}`;
                const deleteAction = `delete:${player.user_id}`;
                const assignedCountryId = countryDrafts[player.user_id] ?? player.country_id;
                const rowFeedback =
                  feedback &&
                  [nameAction, assignAction, pointsAction, deleteAction].includes(feedback.action)
                    ? feedback
                    : null;

                return (
                  <li
                    key={player.user_id}
                    role="row"
                    className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(13rem,1.1fr)_auto] lg:items-center lg:gap-4"
                  >
                    <div role="rowheader" className="min-w-0">
                      {editingNameId === player.user_id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          action={async (formData) => {
                            if (pendingAction) return;
                            setPendingAction(nameAction);
                            setFeedback(null);
                            try {
                              const result = await updatePlayerName(
                                player.user_id,
                                (formData.get("name") as string) || null
                              );
                              if (result.error) {
                                setFeedback({ action: nameAction, type: "error", message: result.error });
                              } else {
                                setEditingNameId(null);
                                setFeedback({ action: nameAction, type: "success", message: "Nom mis à jour." });
                                router.refresh();
                              }
                            } catch {
                              setFeedback({ action: nameAction, type: "error", message: "Impossible de modifier le nom." });
                            } finally {
                              setPendingAction(null);
                            }
                          }}
                        >
                          <label htmlFor={`player-name-${player.user_id}`} className="sr-only">
                            Nom du joueur
                          </label>
                          <input
                            id={`player-name-${player.user_id}`}
                            type="text"
                            name="name"
                            autoComplete="name"
                            defaultValue={player.name ?? ""}
                            placeholder="Nom affiché"
                            disabled={pendingAction !== null}
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                          <button
                            type="submit"
                            disabled={pendingAction !== null}
                            className="min-h-10 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
                          >
                            {pendingAction === nameAction ? "Enregistrement…" : "Enregistrer"}
                          </button>
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => setEditingNameId(null)}
                            className="min-h-10 rounded-lg px-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <>
                          <p className="truncate font-semibold text-[var(--foreground)]">
                            {player.name || "Sans nom"}
                          </p>
                          <p className="truncate text-sm text-[var(--foreground-muted)]">{player.email}</p>
                        </>
                      )}
                    </div>

                    <div role="cell" className="min-w-0">
                      <span className="mb-1 block text-xs font-medium text-[var(--foreground-muted)] lg:hidden">
                        Pays attribué
                      </span>
                      <form
                        className="flex min-w-0 flex-wrap items-center gap-2"
                        action={async (formData) => {
                          if (pendingAction) return;
                          setPendingAction(assignAction);
                          setFeedback(null);
                          try {
                            const result = await assignPlayer(
                              player.user_id,
                              formData.get("country_id") as string
                            );
                            if (result.error) {
                              setCountryDrafts((drafts) => ({
                                ...drafts,
                                [player.user_id]: player.country_id,
                              }));
                              setFeedback({ action: assignAction, type: "error", message: result.error });
                            } else {
                              setFeedback({ action: assignAction, type: "success", message: "Pays attribué." });
                              router.refresh();
                            }
                          } catch {
                            setCountryDrafts((drafts) => ({
                              ...drafts,
                              [player.user_id]: player.country_id,
                            }));
                            setFeedback({ action: assignAction, type: "error", message: "Impossible de changer le pays." });
                          } finally {
                            setPendingAction(null);
                          }
                        }}
                      >
                        <select
                          name="country_id"
                          aria-label={`Pays assigné à ${player.name || player.email}`}
                          value={assignedCountryId}
                          disabled={pendingAction !== null}
                          onChange={(event) =>
                            setCountryDrafts((drafts) => ({
                              ...drafts,
                              [player.user_id]: event.target.value,
                            }))
                          }
                          className={`${inputClass} min-w-0 flex-1`}
                        >
                          {countries.map((country) => (
                            <option key={country.id} value={country.id}>
                              {country.name}
                            </option>
                          ))}
                        </select>
                        {assignedCountryId !== player.country_id ? (
                          <>
                            <button
                              type="submit"
                              disabled={pendingAction !== null}
                              className="min-h-10 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
                            >
                              {pendingAction === assignAction ? "Attribution…" : "Attribuer"}
                            </button>
                            <button
                              type="button"
                              disabled={pendingAction !== null}
                              onClick={() =>
                                setCountryDrafts((drafts) => ({
                                  ...drafts,
                                  [player.user_id]: player.country_id,
                                }))
                              }
                              className="min-h-10 rounded-lg px-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                            >
                              Annuler
                            </button>
                          </>
                        ) : null}
                      </form>
                    </div>

                    <div role="cell" className="flex flex-wrap gap-1 lg:justify-end">
                      <button
                        type="button"
                        disabled={
                          pendingAction !== null || assignedCountryId !== player.country_id
                        }
                        aria-label={`Ajouter 25 points d’action à ${player.countryName}`}
                        onClick={() => setConfirmation({ kind: "points", player })}
                        className="min-h-10 rounded-lg px-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                      >
                        {pendingAction === pointsAction ? "Ajout…" : "+ 25 points"}
                      </button>
                      {editingNameId !== player.user_id ? (
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => {
                            setFeedback(null);
                            setEditingNameId(player.user_id);
                          }}
                          className="min-h-10 rounded-lg px-3 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] disabled:opacity-50"
                        >
                          Renommer
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => setConfirmation({ kind: "delete", player })}
                        className="min-h-10 rounded-lg px-3 text-sm text-[var(--danger)] hover:bg-[var(--background-elevated)] disabled:opacity-50"
                      >
                        {pendingAction === deleteAction ? "Suppression…" : "Supprimer"}
                      </button>
                    </div>

                    {rowFeedback ? (
                      <p
                        role={rowFeedback.type === "error" ? "alert" : "status"}
                        className={`text-xs lg:col-span-3 ${
                          rowFeedback.type === "error"
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        {rowFeedback.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <AdminDialog
        id="create-player-dialog"
        open={createOpen}
        onClose={closeCreateDialog}
        beforeClose={canCloseCreateDialog}
        busy={pendingAction === "create"}
        title="Créer un joueur"
        description="Le compte sera immédiatement associé au pays choisi."
        size="md"
        actions={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pendingAction === "create"}
              onClick={() => {
                if (canCloseCreateDialog()) closeCreateDialog();
              }}
              className="min-h-10 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              Annuler
            </button>
            <button
              type="submit"
              form="create-player-form"
              disabled={pendingAction === "create"}
              className="min-h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
            >
              {pendingAction === "create" ? "Création…" : "Créer le compte"}
            </button>
          </div>
        }
      >
        <form
          id="create-player-form"
          ref={createFormRef}
          className="grid gap-3 sm:grid-cols-2"
          onChange={() => setCreateDirty(true)}
          action={async (formData) => {
            if (pendingAction) return;
            setPendingAction("create");
            setCreateError(null);
            try {
              const result = await createPlayer(formData);
              if (result.error) {
                setCreateError(result.error);
                return;
              }
              setNotice(
                result.existingAssigned
                  ? "Compte existant assigné au pays."
                  : "Joueur créé."
              );
              closeCreateDialog();
              router.refresh();
            } catch {
              setCreateError("Impossible de créer le joueur.");
            } finally {
              setPendingAction(null);
            }
          }}
        >
          <div>
            <label htmlFor="new-player-name" className="mb-1 block text-sm text-[var(--foreground-muted)]">
              Nom affiché
            </label>
            <input
              id="new-player-name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Ex. Kapkio"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-player-country" className="mb-1 block text-sm text-[var(--foreground-muted)]">
              Pays attribué
            </label>
            <select
              id="new-player-country"
              name="country_id"
              required
              defaultValue=""
              className={inputClass}
            >
              <option value="" disabled>Choisir un pays</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-player-email" className="mb-1 block text-sm text-[var(--foreground-muted)]">
              Email
            </label>
            <input
              id="new-player-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-player-password" className="mb-1 block text-sm text-[var(--foreground-muted)]">
              Mot de passe initial
            </label>
            <input
              id="new-player-password"
              type="password"
              name="password"
              autoComplete="new-password"
              aria-describedby="new-player-password-help"
              required
              minLength={6}
              className={inputClass}
            />
            <p id="new-player-password-help" className="mt-1 text-xs text-[var(--foreground-muted)]">
              6 caractères minimum · à transmettre en privé
            </p>
          </div>
          {createError ? (
            <p role="alert" className="sm:col-span-2 text-sm text-[var(--danger)]">
              {createError}
            </p>
          ) : null}
        </form>
      </AdminDialog>
      <AdminConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.kind === "delete" ? "Supprimer ce joueur ?" : "Ajouter 25 points d’action ?"}
        consequence={
          confirmation?.kind === "delete"
            ? `Le compte de ${confirmation.player.name?.trim() || confirmation.player.email} sera supprimé définitivement.`
            : `La réserve de ${confirmation?.player.countryName ?? "ce pays"} augmentera immédiatement de 25 points.`
        }
        confirmLabel={confirmation?.kind === "delete" ? "Supprimer le joueur" : "Ajouter les points"}
        danger={confirmation?.kind === "delete"}
        busy={Boolean(confirmation && pendingAction === `${confirmation.kind}:${confirmation.player.user_id}`)}
        onConfirm={() => void applyConfirmedAction()}
        onClose={() => {
          if (!pendingAction) setConfirmation(null);
        }}
      />
    </div>
  );
}
