"use client";

import { Tooltip } from "@/components/ui/Tooltip";

type InfoTooltipProps = {
  content: React.ReactNode;
  side?: "top" | "bottom";
  warning?: boolean;
  label?: string;
};

export function InfoTooltip({
  content,
  side = "top",
  warning = false,
  label,
}: InfoTooltipProps) {
  const accessibleLabel = label
    ? `Explication : ${label}`
    : warning
      ? "Explication importante"
      : "Explication";
  return (
    <Tooltip content={content} side={side} label={accessibleLabel}>
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold leading-none"
        style={{
          borderColor: warning ? "var(--danger)" : "var(--border-muted)",
          color: warning ? "var(--danger)" : "var(--foreground-muted)",
          background: "var(--background)",
        }}
        aria-hidden
      >
        i
      </span>
    </Tooltip>
  );
}
