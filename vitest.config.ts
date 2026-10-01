import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the `@/*` path mapping in tsconfig.json so suites can import the
  // same specifiers the application does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Vitest loads .dev.vars-equivalent values for the suites that need the
    // owner's email. Tests never need the password itself.
    setupFiles: ["tests/setup.ts"],
    globals: false,
    restoreMocks: true,
  },
});
