import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fates of Nations — Requêtes joueurs",
  description:
    "Le registre des améliorations proposées par les joueurs, classées par thème, état et complexité.",
  openGraph: {
    title: "Fates of Nations — Requêtes joueurs",
    description:
      "Des retours joueurs transformés en demandes claires, classées et estimées.",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary",
    title: "Fates of Nations — Requêtes joueurs",
    description:
      "Des retours joueurs transformés en demandes claires, classées et estimées.",
  },
};

export default function RequestsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
