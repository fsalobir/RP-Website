import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Réduit le temps de compilation en optimisant les imports des packages lourds
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr"],
  },
};

export default nextConfig;
