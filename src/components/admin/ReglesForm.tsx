"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RuleParameter } from "@/types/database";
import { RULE_SECTIONS, getRuleLabel } from "@/lib/ruleParameters";

export function ReglesForm({
  rules,
}: {
  rules: RuleParameter[];
}) {
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const updateValue = (id: string, value: unknown) => {
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, value } : r))
    );
  };

  async function saveAll() {
    if (items.length === 0) return;
    setError(null);
    setSaving(true);
    for (const row of items) {
      const { error: err } = await supabase
        .from("rule_parameters")
        .update({ value: row.value })
        .eq("id", row.id);
      if (err) {
        setError(err.message);
        break;
      }
    }
    setSaving(false);
  }

  const rulesByKey = useMemo(() => new Map(items.map((r) => [r.key, r])), [items]);
  const allSectionKeys = useMemo(
    () => new Set(RULE_SECTIONS.flatMap((s) => s.keys)),
    []
  );
  const otherRules = useMemo(
    () => items.filter((r) => !allSectionKeys.has(r.key)),
    [items, allSectionKeys]
  );

  const inputClass =
    "w-full rounded border bg-[var(--background)] px-3 py-2 font-mono text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <div className="space-y-4">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
            Règles de simulation
          </h1>
          <p className="text-[var(--foreground-muted)]">
            Ces paramètres sont utilisés par le cron pour faire évoluer population, PIB, etc.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="shrink-0 rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </div>
      {error && <p className="text-[var(--danger)]">{error}</p>}
      {items.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre. Ajoutez-en via SQL (table rule_parameters).</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
            {RULE_SECTIONS.map((section) => {
              const hasAny = section.keys.some((k) => rulesByKey.has(k));
              if (!hasAny) return null;
              return (
                <div key={section.title}>
                  <div
                    className="px-4 py-2"
                    style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}
                  >
                    <span className="text-sm font-medium text-[var(--foreground-muted)]">
                      {section.title}
                    </span>
                  </div>
                  {section.keys.map((key) => {
                    const r = rulesByKey.get(key);
                    if (!r) return null;
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                        <div className="w-full min-w-0 sm:w-48">
                          <span className="text-sm font-medium text-[var(--foreground)]">
                            {getRuleLabel(key)}
                          </span>
                          {section.keys.length === 1 && r.description && (
                            <p className="text-xs text-[var(--foreground-muted)]">{r.description}</p>
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={
                              typeof r.value === "object"
                                ? JSON.stringify(r.value)
                                : String(r.value ?? "")
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              let parsed: unknown = v;
                              if (/^-?\d+(\.\d+)?$/.test(v)) parsed = Number(v);
                              else if (v.startsWith("{") || v.startsWith("[")) {
                                try {
                                  parsed = JSON.parse(v);
                                } catch {
                                  parsed = v;
                                }
                              }
                              updateValue(r.id, parsed);
                            }}
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {otherRules.length > 0 && (
              <div>
                <div
                  className="px-4 py-2"
                  style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}
                >
                  <span className="text-sm font-medium text-[var(--foreground-muted)]">Autres paramètres</span>
                </div>
                {otherRules.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                    <div className="w-full min-w-0 sm:w-48">
                      <span className="font-mono text-sm text-[var(--foreground)]">{r.key}</span>
                      {r.description && (
                        <p className="text-xs text-[var(--foreground-muted)]">{r.description}</p>
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={
                          typeof r.value === "object"
                            ? JSON.stringify(r.value)
                            : String(r.value ?? "")
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          let parsed: unknown = v;
                          if (/^-?\d+(\.\d+)?$/.test(v)) parsed = Number(v);
                          else if (v.startsWith("{") || v.startsWith("[")) {
                            try {
                              parsed = JSON.parse(v);
                            } catch {
                              parsed = v;
                            }
                          }
                          updateValue(r.id, parsed);
                        }}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
