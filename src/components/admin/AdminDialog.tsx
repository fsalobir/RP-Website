"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const widthClasses = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-5xl sm:ml-auto sm:mr-2 sm:h-[calc(100dvh-1rem)]",
} as const;

let openAdminDialogCount = 0;
let previousDocumentOverflow = "";

export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  busy = false,
  size = "md",
  id,
  beforeClose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  size?: keyof typeof widthClasses;
  id?: string;
  beforeClose?: () => boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    if (openAdminDialogCount === 0) {
      previousDocumentOverflow = root.style.overflow;
      root.style.overflow = "hidden";
    }
    openAdminDialogCount += 1;
    return () => {
      openAdminDialogCount = Math.max(0, openAdminDialogCount - 1);
      if (openAdminDialogCount === 0) root.style.overflow = previousDocumentOverflow;
    };
  }, [open]);

  function requestClose() {
    if (beforeClose && !beforeClose()) return;
    onClose();
  }

  return (
    <dialog
      id={id}
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy || undefined}
      onClose={onClose}
      onCancel={(event) => {
        if (busy || (beforeClose && !beforeClose())) event.preventDefault();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) requestClose();
      }}
      className={`admin-dialog m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-hidden rounded-xl border p-0 text-[var(--foreground)] shadow-[0_24px_64px_rgba(0,0,0,0.55)] ${widthClasses[size]}`}
      style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
    >
      <div className="flex h-full max-h-[calc(100dvh-1rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-[var(--foreground-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Fermer"
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-xl text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] disabled:opacity-50 sm:min-h-9 sm:min-w-9"
          >
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {actions ? (
          <footer className="shrink-0 border-t bg-[var(--background-panel)] px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)" }}>
            {actions}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
