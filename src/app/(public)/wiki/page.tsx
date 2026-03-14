import { WikiClient } from "./WikiClient";

export const metadata = {
  title: "Wiki",
  description: "Guide du simulateur : accueil, fiche pays, carte, classement, idéologie, règles.",
};

export default function WikiPage() {
  return (
    <div className="relative min-h-screen">
      {/* Arrière-plan fixe (aligné accueil / classement / fiche pays) */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ left: "50%", marginLeft: "-50vw", width: "100vw", zIndex: 0 }}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/pays-accueil-bg.png)",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <div className="relative z-10" style={{ isolation: "isolate" }}>
        <WikiClient />
      </div>
    </div>
  );
}
