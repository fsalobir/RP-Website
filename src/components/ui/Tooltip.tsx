"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Optionnel : position préférée (par défaut au-dessus) */
  side?: "top" | "bottom";
  /** Délai en ms avant fermeture au leave. Défaut 120. */
  closeDelay?: number;
  /** Si true, le tooltip reste ouvert pour permettre de cliquer un lien à l’intérieur : pas de fermeture au leave du déclencheur ni du contenu, seulement au clic en dehors (ou au clic sur l’icône). */
  interactive?: boolean;
};

/**
 * Tooltip : affiché au survol (desktop) ou au clic (mobile).
 * Réutilisable partout dans l’app.
 */
const DEFAULT_CLOSE_DELAY = 120;
const FADE_OUT_MS = 200;
const INTERACTIVE_AUTO_CLOSE_MS = 2000;

export function Tooltip({
  content,
  children,
  side = "top",
  closeDelay = DEFAULT_CLOSE_DELAY,
  interactive = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearAutoCloseTimeout = useCallback(() => {
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
  }, []);

  const requestClose = useCallback(() => {
    clearCloseTimeout();
    clearAutoCloseTimeout();
    setClosing(true);
  }, [clearCloseTimeout, clearAutoCloseTimeout]);

  const openTooltip = useCallback(() => {
    clearCloseTimeout();
    clearAutoCloseTimeout();
    setClosing(false);
    setOpen((wasOpen) => {
      if (!wasOpen) setPosition((prev) => ({ ...prev, ready: false }));
      return true;
    });
  }, [clearCloseTimeout, clearAutoCloseTimeout]);

  const closeTooltipSoon = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => requestClose(), closeDelay);
  }, [clearCloseTimeout, closeDelay, requestClose]);

  const handleTriggerLeave = useCallback(() => {
    if (interactive) return;
    closeTooltipSoon();
  }, [interactive, closeTooltipSoon]);

  /** Au survol du contenu du tooltip : annuler une fermeture programmée sans toucher à position (évite de mettre ready: false et de faire disparaître le tooltip). */
  const handleTooltipContentEnter = useCallback(() => {
    clearCloseTimeout();
    clearAutoCloseTimeout();
  }, [clearCloseTimeout, clearAutoCloseTimeout]);

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
        requestClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open, requestClose]);

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
    if (closing) {
      fadeTimeoutRef.current = setTimeout(() => {
        setOpen(false);
        setClosing(false);
        fadeTimeoutRef.current = null;
      }, FADE_OUT_MS);
      return () => {
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      };
    }
  }, [closing]);

  useEffect(() => {
    if (open && interactive) {
      autoCloseTimeoutRef.current = setTimeout(() => requestClose(), INTERACTIVE_AUTO_CLOSE_MS);
      return () => clearAutoCloseTimeout();
    }
  }, [open, interactive, requestClose, clearAutoCloseTimeout]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
      clearAutoCloseTimeout();
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [clearCloseTimeout, clearAutoCloseTimeout]);

  return (
    <span
      ref={wrapperRef}
      className="inline-flex cursor-help"
      onMouseEnter={openTooltip}
      onMouseLeave={handleTriggerLeave}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        clearCloseTimeout();
        clearAutoCloseTimeout();
        setOpen((o) => {
          if (o) {
            requestClose();
            return true;
          }
          setPosition((prev) => ({ ...prev, ready: false }));
          return true;
        });
      }}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              onMouseEnter={handleTooltipContentEnter}
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
                opacity: closing ? 0 : 1,
                transition: `opacity ${FADE_OUT_MS}ms ease-out`,
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
