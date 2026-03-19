"use client";

type EntityInfoPanelProps = {
  kind: string;
  title: string;
  lines: string[];
  onClose: () => void;
};

export function EntityInfoPanel({ kind, title, lines, onClose }: EntityInfoPanelProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0f0b07]/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-200/80">{kind}</p>
            <h3 className="text-base font-semibold text-amber-100">{title}</h3>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-stone-200 hover:bg-white/10"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto px-4 py-3 text-sm text-stone-200">
          {lines.map((line, idx) => (
            <p key={`${kind}-${idx}`}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

