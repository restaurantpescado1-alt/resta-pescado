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
    // `.test.tsx` is listed because `tests/unit/gallery-grid.test.tsx` renders a
    // component with `renderToStaticMarkup`. A `.ts`-only glob compiles past it in
    // silence, which reads as "no failures" rather than "this was never run".
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // Vitest loads .dev.vars-equivalent values for the suites that need the
    // owner's email. Tests never need the password itself.
    setupFiles: ["tests/setup.ts"],
    globals: false,
    restoreMocks: true,
  },
});
