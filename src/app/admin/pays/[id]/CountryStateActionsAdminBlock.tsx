"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { addStateActions } from "../../joueurs/actions";

type RequestRow = {
  id: string;
  created_at: string;
  status: string;
  label: string;
  targetName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "À décider",
  pending_target: "Accord de la cible",
  accepted: "Acceptée",
  refused: "Refusée",
};

export function CountryStateActionsAdminBlock({
  countryId,
  countryName,
  balance,
  requests,
}: {
  countryId: string;
  countryName: string;
  balance: number;
  requests: RequestRow[];
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Réserve d’actions</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {balance} action{balance > 1 ? "s" : ""} disponible{balance > 1 ? "s" : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#08110c] hover:opacity-90"
        >
          Ajouter 25 actions
        </button>
      </section>

      {message ? <p role="status" className="text-sm text-[var(--accent)]">{message}</p> : null}

      <section className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
        >
          <div>
            <h2 className="font-semibold text-[var(--foreground)]">Demandes récentes</h2>
            <p className="text-sm text-[var(--foreground-muted)]">{requests.length} affichée{requests.length > 1 ? "s" : ""}</p>
          </div>
          <Link
            href="/admin/demandes"
            className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          >
            Ouvrir la file
          </Link>
        </header>
        {requests.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--foreground-muted)]">
            Aucune demande pour ce pays.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {requests.map((request) => (
              <article key={request.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--foreground)]">{request.label}</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {request.targetName ? `Cible : ${request.targetName} · ` : ""}
                    {new Date(request.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <span className="text-sm font-medium text-[var(--foreground-muted)]">
                  {STATUS_LABELS[request.status] ?? request.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <AdminConfirmDialog
        open={confirmOpen}
        title={`Ajouter 25 actions à ${countryName} ?`}
        consequence="La réserve sera immédiatement utilisable par le joueur assigné à ce pays."
        confirmLabel="Ajouter"
        busy={pending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (pending) return;
          startTransition(async () => {
            const result = await addStateActions(countryId, 25);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setConfirmOpen(false);
            setMessage("25 actions ajoutées.");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
