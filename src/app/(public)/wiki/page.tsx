import { WikiClient } from "./WikiClient";

export const metadata = {
  title: "Wiki",
  description: "Guide du simulateur : accueil, fiche pays, carte, classement, idéologie, règles.",
};

export default function WikiPage() {
  return (
    <div className="min-h-screen">
      <WikiClient />
    </div>
  );
}
