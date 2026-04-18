import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /** One process: `process.chdir` in config tests must not race other files. */
    fileParallelism: false,
  },
});
