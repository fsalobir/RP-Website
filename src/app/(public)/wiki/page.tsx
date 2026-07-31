import { WikiClient } from "./WikiClient";
import { fetchWikiPages } from "@/lib/wiki/queries";
import { PublicPageHeader } from "@/components/ui/PublicPageHeader";

export const metadata = {
  title: "Wiki",
  description: "Guide du simulateur : accueil, fiche pays, carte, classement, idéologie, règles.",
};

export default async function WikiPage() {
  const pages = await fetchWikiPages();
  return (
    <div className="relative min-h-screen">
      {/* Arrière-plan fixe (aligné accueil / classement / fiche pays) */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/pays-accueil-bg.png)",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,211,122,0.13),transparent_38%),linear-gradient(180deg,rgba(3,8,11,0.38)_0%,rgba(3,8,11,0.76)_48%,rgba(3,8,11,0.95)_100%)]" />
      </div>
      <div className="relative z-10" style={{ isolation: "isolate" }}>
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <PublicPageHeader title="Wiki" icon="wiki" />
        </div>
        <WikiClient initialPages={pages} />
      </div>
    </div>
  );
}
