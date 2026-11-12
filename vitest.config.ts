import { defineConfig } from "vitest/config";

// Run the TypeScript sources only. vitest 5 no longer excludes dist/ by default, and the compiled copies of the
// tests (tsc output) would otherwise run a second time.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
