import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roleplay",
  description: "Base de données des pays, règles et indicateurs – simulation de conflit moderne.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* flex sur un wrapper : évite que les modales (portail) soient des flex items du body avec un empilement bizarre sous le header sticky */}
        <div className="flex min-h-screen flex-col">{children}</div>
        <div id="fon-modal-root" />
      </body>
    </html>
  );
}
