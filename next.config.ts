import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr"],
    turbopackFileSystemCacheForDev: true,
  },
  webpack: (config) => {
    // Forcer la résolution des modules depuis le projet (évite resolve dans le dossier parent GitHub)
    config.resolve ??= {};
    config.resolve.context = projectRoot;
    return config;
  },
};

export default nextConfig;
