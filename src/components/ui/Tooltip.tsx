"use client";

import { useState, useRef, useEffect } from "react";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Optionnel : position préférée (par défaut au-dessus) */
  side?: "top" | "bottom";
};

/**
 * Tooltip : affiché au survol (desktop) ou au clic (mobile).
 * Réutilisable partout dans l’app.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="z-50 block max-w-xs rounded border px-3 py-2 text-sm shadow-lg"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...(side === "top"
              ? { bottom: "100%", marginBottom: "6px" }
              : { top: "100%", marginTop: "6px" }),
            background: "var(--background-elevated)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
