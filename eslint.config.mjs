import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Verification builds written by NEXT_DIST_DIR.
    ".next-verify/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Impeccable skill scripts: third-party, updated by its installer.
    ".claude/**",
  ]),
]);

export default eslintConfig;
