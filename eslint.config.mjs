import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config. `eslint-config-next@16` ships native flat configs, so they are
 * spread directly rather than through `FlatCompat`, which cannot serialise the
 * plugin objects these configs carry.
 */
const eslintConfig = [
  {
    // Build output. `.wrangler/tmp` matters in particular: `wrangler dev` and
    // `opennextjs-cloudflare preview` each leave a several-megabyte bundled
    // `worker.js` there, and linting it produces thousands of irrelevant errors.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The seed and migration scripts are command-line tools. Their stdout is the
    // interface, so `console.log` is the correct call there.
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
