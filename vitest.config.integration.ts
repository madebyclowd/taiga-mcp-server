import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Run integration test files sequentially, not in parallel workers —
    // these hit a real, rate-limited external API, and concurrent load
    // across files was observed to cause transient failures (e.g. a
    // GET immediately after a POST returning no row) that don't
    // reproduce when the same test runs alone. Real external-service
    // flakiness ADR-005 accepts as a tradeoff; this just avoids adding
    // self-inflicted concurrency on top of it.
    fileParallelism: false,
  },
});
