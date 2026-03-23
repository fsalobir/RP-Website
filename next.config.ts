import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr"],
    turbopackFileSystemCacheForDev: true,
    /**
     * Upload wiki via Server Action + FormData : défaut Next = 1 Mo → erreur client
     * « An unexpected response was received from the server » si fichier > limite.
     * Aligné sur l’upload max. côté `uploadWikiImageAction` (5 Mo + marge multipart).
     */
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  webpack: (config) => {
    // Forcer la résolution des modules depuis le projet (évite resolve dans le dossier parent GitHub)
    config.resolve ??= {};
    config.resolve.context = projectRoot;
    return config;
  },
};

export default nextConfig;
