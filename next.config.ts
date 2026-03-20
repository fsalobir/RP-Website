import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(process.cwd());

// NEXT_PUBLIC_* are inlined at build time. Log what the bundle will embed (helps debug prod vs local).
if (process.env.VERCEL === "1" || process.env.CI === "true") {
  const r = process.env.NEXT_PUBLIC_MAP_RENDERER ?? "(unset → svg)";
  const o = process.env.NEXT_PUBLIC_MAP_RENDERER_ROLLOUT ?? "(unset → off)";
  const z = process.env.NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE ?? "(unset → 0)";
  const f = process.env.NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG ?? "(unset → 0)";
  console.log(`[map.build] VERCEL_ENV=${process.env.VERCEL_ENV ?? "?"} NEXT_PUBLIC_MAP_RENDERER=${r} ROLLOUT=${o} ZERO_SVG_SPIKE=${z} FORCE_SVG=${f}`);
}

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
