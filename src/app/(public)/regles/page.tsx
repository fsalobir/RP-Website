import { createClient } from "@/lib/supabase/server";
import { getRuleLabel } from "@/lib/ruleParameters";

export default async function ReglesPage() {
  const supabase = await createClient();
  const { data: rules, error } = await supabase
    .from("rule_parameters")
    .select("key, value, description")
    .order("key");

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--danger)]">Erreur lors du chargement des règles.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Règles de simulation
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Paramètres utilisés par le moteur de simulation (cron) pour l’évolution des indicateurs.
      </p>

      {!rules?.length ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre défini.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Paramètre
                </th>
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Valeur
                </th>
                <th className="p-4 font-medium text-[var(--foreground-muted)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.key}
                  className="border-b"
                  style={{ borderColor: "var(--border-muted)" }}
                >
                  <td className="p-4 text-[var(--foreground)]">{getRuleLabel(r.key)}</td>
                  <td className="stat-value p-4 font-mono">
                    {typeof r.value === "object"
                      ? JSON.stringify(r.value)
                      : String(r.value)}
                  </td>
                  <td className="p-4 text-[var(--foreground-muted)]">
                    {r.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
