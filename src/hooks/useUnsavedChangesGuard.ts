"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE = "Des modifications ne sont pas enregistrées. Quitter cette page ?";

export function useUnsavedChangesGuard(isDirty: boolean, message = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    let navigationConfirmed = false;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationConfirmed) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handleLinkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      ) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        navigationConfirmed = true;
        window.setTimeout(() => {
          navigationConfirmed = false;
        }, 0);
      }
    };

    const currentUrl = window.location.href;
    const guardState = { ...window.history.state, __unsavedChangesGuard: true };
    window.history.pushState(guardState, "", currentUrl);

    const handlePopState = () => {
      if (navigationConfirmed) return;
      if (window.confirm(message)) {
        navigationConfirmed = true;
        window.history.back();
      } else {
        window.history.pushState(guardState, "", currentUrl);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleLinkClick, true);
      if (window.history.state?.__unsavedChangesGuard) window.history.back();
    };
  }, [isDirty, message]);
}
