import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      provider: "v8",
      include: [
        "src/lib/countryEffects.ts",
        "src/lib/expectedNextTick.ts",
        "src/lib/tickBreakdown.ts",
        "src/lib/stateActionDice.ts",
        "src/lib/stateActionConsequences.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

