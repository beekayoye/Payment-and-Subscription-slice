import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // Pre-existing standalone Node/CJS tooling script, not part of the
    // Next.js app — out of scope for the app's TypeScript/ESM lint rules.
    "design-tokens-to-css.js",
  ]),
]);

export default eslintConfig;
