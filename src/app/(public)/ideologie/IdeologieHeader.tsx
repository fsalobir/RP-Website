"use client";

import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";

export function IdeologieHeader() {
  return (
    <div className="mb-8 flex flex-wrap items-start gap-2">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Idéologie</h1>
        <p className="mt-1 text-[var(--foreground-muted)]">
          Panorama immersif du monde selon les trois grands pôles idéologiques : Monarchisme, Républicanisme et Cultisme.
        </p>
      </div>
      <InfoTooltipWithWikiLink
        text="Position des pays sur le triangle idéologique. Filtrez et cliquez sur un point pour voir le détail et ouvrir la fiche pays."
        wikiSectionId="ideologie-lecture-triangle"
        side="bottom"
      />
    </div>
  );
}
