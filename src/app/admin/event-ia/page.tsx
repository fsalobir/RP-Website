import { notFound } from "next/navigation";
import { RpPipelineDashboard } from "@/components/admin/RpPipelineDashboard";
import { getCachedAuth } from "@/lib/auth-server";
import { loadRpPipelineDashboard } from "./pipeline-data";

const allowedTabs = ["pipeline", "bibliotheque", "alertes", "routage", "reglages"] as const;
type TabId = typeof allowedTabs[number];

export default async function AdminEventIaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const [{ tab, q, page }, auth] = await Promise.all([searchParams, getCachedAuth()]);
  if (!auth.isRpStaff) notFound();
  const libraryPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const data = await loadRpPipelineDashboard(auth.isAdmin, {
    libraryQuery: q ?? "",
    libraryPage,
  });
  const requestedTab: TabId = allowedTabs.includes(tab as TabId) ? tab as TabId : "pipeline";
  const activeTab: TabId = !auth.isAdmin && ["routage", "reglages"].includes(requestedTab)
    ? "pipeline"
    : requestedTab;
  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6">
      <div className="mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Moteur RP et publications</h1>
          <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--foreground-muted)]">
            Validez les actions, leurs conséquences et leur publication Discord.
          </p>
        </div>
      </div>
      <RpPipelineDashboard
        data={data}
        activeTab={activeTab}
        query={q ?? ""}
        isAdmin={auth.isAdmin}
      />
    </div>
  );
}
