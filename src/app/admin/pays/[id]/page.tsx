import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CountryForm } from "@/components/admin/CountryForm";
import {
  CountryWorkspace,
} from "@/app/(public)/pays/[slug]/page";
import type { CountryWorkspaceTab } from "@/app/(public)/pays/[slug]/CountryTabs";
import { createClient } from "@/lib/supabase/server";
import { AdminCountryNav } from "./AdminCountryNav";
import { ControlAdminBlock } from "./ControlAdminBlock";
import { CountryStateActionsAdminBlock } from "./CountryStateActionsAdminBlock";
import { DeleteCountryButton } from "./DeleteCountryButton";

const COUNTRY_TABS = [
  { id: "identite", label: "Identité" },
  { id: "general", label: "Situation générale" },
  { id: "cabinet", label: "Cabinet" },
  { id: "military", label: "Militaire" },
  { id: "etat_major", label: "État-major" },
  { id: "perks", label: "Avantages" },
  { id: "budget", label: "Budget" },
  { id: "laws", label: "Lois" },
  { id: "state_actions", label: "Actions d’État" },
  { id: "controle", label: "Contrôle" },
  { id: "debug", label: "Diagnostic" },
  { id: "suppression", label: "Suppression" },
] as const;

type AdminCountryTab = (typeof COUNTRY_TABS)[number]["id"];

const WORKSPACE_TABS = new Set<AdminCountryTab>([
  "general",
  "cabinet",
  "military",
  "etat_major",
  "perks",
  "budget",
  "laws",
  "debug",
]);

export default async function AdminPaysEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string | string[] }>;
}) {
  const { id } = await params;
  const requestedTab = (await searchParams).onglet;
  const activeTab: AdminCountryTab = COUNTRY_TABS.some(
    ({ id: tabId }) => tabId === requestedTab,
  )
    ? (requestedTab as AdminCountryTab)
    : "general";

  const supabase = await createClient();
  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (countryError) {
    throw new Error(`Impossible de charger le pays : ${countryError.message}`);
  }
  if (!country) notFound();

  let content: ReactNode;

  if (activeTab === "identite") {
    const { data: continents, error } = await supabase
      .from("continents")
      .select("id, slug, label_fr")
      .order("sort_order");
    if (error) throw new Error(`Impossible de charger les continents : ${error.message}`);
    content = <CountryForm country={country} continents={continents ?? []} />;
  } else if (activeTab === "controle") {
    const [controlRes, countriesRes] = await Promise.all([
      supabase
        .from("country_control")
        .select("id, controller_country_id, share_pct, is_annexed, updated_at")
        .eq("country_id", id),
      supabase.from("countries").select("id, name").order("name"),
    ]);
    const loadError = controlRes.error ?? countriesRes.error;
    if (loadError) throw new Error(`Impossible de charger le contrôle : ${loadError.message}`);

    const countries = countriesRes.data ?? [];
    const countryById = new Map(countries.map((item) => [item.id, item]));
    const controls = (controlRes.data ?? []).map((row) => ({
      id: row.id,
      controller_country_id: row.controller_country_id,
      controller_name:
        countryById.get(row.controller_country_id)?.name ?? row.controller_country_id,
      share_pct: Number(row.share_pct),
      is_annexed: Boolean(row.is_annexed),
      updated_at: row.updated_at,
    }));

    content = (
      <ControlAdminBlock
        countryId={id}
        controls={controls}
        otherCountries={countries.filter((item) => item.id !== id)}
      />
    );
  } else if (activeTab === "state_actions") {
    const [balanceRes, requestsRes] = await Promise.all([
      supabase
        .from("country_state_action_balance")
        .select("balance")
        .eq("country_id", id)
        .maybeSingle(),
      supabase
        .from("state_action_requests")
        .select("id, created_at, status, state_action_types(label_fr)")
        .eq("country_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const loadError = balanceRes.error ?? requestsRes.error;
    if (loadError) throw new Error(`Impossible de charger les actions d’État : ${loadError.message}`);

    content = (
      <CountryStateActionsAdminBlock
        countryId={id}
        countryName={country.name}
        balance={Number(balanceRes.data?.balance ?? 0)}
        requests={(requestsRes.data ?? []).map((request) => {
          const actionType = Array.isArray(request.state_action_types)
            ? request.state_action_types[0]
            : request.state_action_types;
          return {
            id: request.id,
            created_at: request.created_at,
            status: request.status,
            label: actionType?.label_fr ?? "Action d’État",
            targetName: null,
          };
        })}
      />
    );
  } else if (activeTab === "suppression") {
    content = (
      <section aria-label="Suppression du pays">
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Supprimer le pays</h2>
        <p className="mb-4 max-w-2xl text-sm text-[var(--foreground-muted)]">
          Cette opération retire le pays et ses données associées. Elle ne doit servir qu’à corriger une création erronée.
        </p>
        <DeleteCountryButton countryId={id} countryName={country.name} />
      </section>
    );
  } else if (WORKSPACE_TABS.has(activeTab)) {
    content = (
      <CountryWorkspace
        slug={country.slug}
        initialTab={activeTab as CountryWorkspaceTab}
        embedded
      />
    );
  } else {
    content = null;
  }

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-5 sm:px-6">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {country.flag_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={country.flag_url}
              alt=""
              className="h-10 w-14 shrink-0 rounded-md border object-cover"
              style={{ borderColor: "var(--border)" }}
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-[var(--foreground)]">{country.name}</h1>
            <p className="truncate text-sm text-[var(--foreground-muted)]">
              {country.regime || "Régime non renseigné"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pays/${country.slug}`}
            className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          >
            Ouvrir la fiche joueur
          </Link>
          <Link
            href="/admin/pays"
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← Tous les pays
          </Link>
        </div>
      </header>

      <div className="grid gap-5 pt-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-7">
        <AdminCountryNav
          countryId={id}
          items={COUNTRY_TABS.map((tab) => ({ ...tab }))}
          activeId={activeTab}
        />
        <section aria-label={COUNTRY_TABS.find((tab) => tab.id === activeTab)?.label} className="min-w-0">
          {content}
        </section>
      </div>
    </div>
  );
}
