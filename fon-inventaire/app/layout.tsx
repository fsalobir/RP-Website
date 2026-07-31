import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fates of Nations — Requêtes joueurs",
  description:
    "Le registre des améliorations proposées par les joueurs de Fates of Nations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
