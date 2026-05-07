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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Independent Remotion sub-project with its own deps; linting it from
    // the root crashes the parser (heap OOM on its node_modules graph).
    "videos/**",
    // OpenNext output and Wrangler dev artifacts.
    ".open-next/**",
    ".wrangler/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
