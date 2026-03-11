"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/Tooltip";

type InfoTooltipWithWikiLinkProps = {
  /** Courte explication (une phrase, ton gameplay). */
  text: string;
  /** Ancre wiki pour le lien « En savoir plus » (ex: accueil-colonnes). */
  wikiSectionId: string;
  side?: "top" | "bottom";
};

export function InfoTooltipWithWikiLink({
  text,
  wikiSectionId,
  side = "top",
}: InfoTooltipWithWikiLinkProps) {
  const href = `/wiki#${wikiSectionId}`;
  return (
    <Tooltip
      side={side}
      interactive
      content={
        <span className="block space-y-2">
          <span className="block">{text}</span>
          <Link
            href={href}
            className="inline-block text-sm font-medium text-[var(--accent)] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            En savoir plus
          </Link>
        </span>
      }
    >
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none"
        style={{
          borderColor: "var(--border-muted)",
          color: "var(--foreground-muted)",
          background: "var(--background)",
        }}
        aria-label="Aide"
        role="img"
      >
        i
      </span>
    </Tooltip>
  );
}
