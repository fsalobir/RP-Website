"use client";

import { AdminDialog } from "./AdminDialog";

export function AdminConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title={title}
      busy={busy}
      size="sm"
      actions={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${
              danger
                ? "bg-[var(--danger)] text-white"
                : "bg-[var(--accent)] text-[#08110c]"
            }`}
          >
            {busy ? "Application…" : confirmLabel}
          </button>
        </div>
      )}
    >
      <p className="text-sm leading-6 text-[var(--foreground-muted)]">{consequence}</p>
    </AdminDialog>
  );
}
