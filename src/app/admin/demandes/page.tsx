import { createClient } from "@/lib/supabase/server";
import { DemandesList } from "@/components/admin/DemandesList";

export default async function AdminDemandesPage() {
  const supabase = await createClient();
  const [requestsRes, rosterRes] = await Promise.all([
    supabase
      .from("state_action_requests")
      .select(`
        id, country_id, user_id, action_type_id, status, payload, admin_effect_added,
        refund_actions, refusal_message, created_at, resolved_at, resolved_by,
        country:countries(id, name, slug),
        state_action_types:state_action_types(key, label_fr, cost)
      `)
      .order("created_at", { ascending: false }),
    supabase.from("military_roster_units").select("id, name_fr").order("name_fr"),
  ]);

  type RequestRow = {
    id: string;
    country_id: string;
    user_id: string;
    action_type_id: string;
    status: string;
    payload: Record<string, unknown> | null;
    admin_effect_added: Record<string, unknown> | null;
    refund_actions: boolean;
    refusal_message: string | null;
    created_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    country?: { name: string; slug: string } | null;
    state_action_types?: { key: string; label_fr: string; cost: number } | null;
  };

  const raw = (requestsRes.data ?? []) as Record<string, unknown>[];
  const requests: RequestRow[] = raw.map((r) => {
    const country = r.country;
    const typeRow = r.state_action_types;
    return {
      ...r,
      country: Array.isArray(country) ? country[0] : country,
      state_action_types: Array.isArray(typeRow) ? typeRow[0] : typeRow,
    } as RequestRow;
  });

  const rosterUnitIds = (rosterRes.data ?? []) as { id: string; name_fr: string }[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Demandes
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Tickets des joueurs (actions d'État). Cliquez sur une ligne pour voir le détail, modifier l'effet attaché, accepter ou refuser.
      </p>
      <DemandesList requests={requests} rosterUnitIds={rosterUnitIds} />
    </div>
  );
}
