"use client";

import { Tooltip } from "@/components/ui/Tooltip";

type InfoTooltipProps = {
  content: React.ReactNode;
  side?: "top" | "bottom";
  warning?: boolean;
};

export function InfoTooltip({ content, side = "top", warning = false }: InfoTooltipProps) {
  return (
    <Tooltip content={content} side={side}>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none"
        style={{
          borderColor: warning ? "var(--danger)" : "var(--border-muted)",
          color: warning ? "var(--danger)" : "var(--foreground-muted)",
          background: "var(--background)",
        }}
        aria-label={warning ? "Aide importante" : "Aide"}
        role="img"
      >
        i
      </span>
    </Tooltip>
  );
}
