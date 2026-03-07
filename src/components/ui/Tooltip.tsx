"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false,
  });

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openTooltip = useCallback(() => {
    clearCloseTimeout();
    setPosition((prev) => ({ ...prev, ready: false }));
    setOpen(true);
  }, [clearCloseTimeout]);

  const closeTooltipSoon = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimeout]);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current || !tooltipRef.current || typeof window === "undefined") return;
    const triggerRect = wrapperRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const canShowTop = triggerRect.top >= tooltipRect.height + gap + margin;
    const canShowBottom = viewportHeight - triggerRect.bottom >= tooltipRect.height + gap + margin;
    const placement = side === "top" ? (canShowTop || !canShowBottom ? "top" : "bottom") : (canShowBottom || !canShowTop ? "bottom" : "top");
    const left = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2, margin),
      viewportWidth - tooltipRect.width - margin
    );
    const unclampedTop = placement === "top" ? triggerRect.top - tooltipRect.height - gap : triggerRect.bottom + gap;
    const top = Math.min(
      Math.max(unclampedTop, margin),
      viewportHeight - tooltipRect.height - margin
    );
    setPosition({ top, left, ready: true });
  }, [side]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      const insideTrigger = wrapperRef.current?.contains(target) ?? false;
      const insideTooltip = tooltipRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideTooltip) {
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

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    function handleViewportChange() {
      updatePosition();
    }
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, [clearCloseTimeout]);

  return (
    <span
      ref={wrapperRef}
      className="inline-flex cursor-help"
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltipSoon}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        clearCloseTimeout();
        setOpen((o) => {
          if (!o) setPosition((prev) => ({ ...prev, ready: false }));
          return !o;
        });
      }}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              onMouseEnter={openTooltip}
              onMouseLeave={closeTooltipSoon}
              className="block rounded border px-3 py-2 text-sm shadow-xl"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                zIndex: 9999,
                width: "max-content",
                maxWidth: "min(34rem, calc(100vw - 24px))",
                whiteSpace: "normal",
                visibility: position.ready ? "visible" : "hidden",
                background: "var(--background-elevated)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
