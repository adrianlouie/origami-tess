import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Property tests over tilings take about a second when quiet and several times that under
    // load or on CI; a generous limit keeps them from flaking while a real hang still fails.
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts", "core/**/*.test.ts", "app/**/*.test.ts"],
  },
});
