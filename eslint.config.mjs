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
  // Blast v3 hardening — sql.unsafe is BANNED inside lib/blast/** to prevent
  // the SQL parameter casting defect class that caused 7+ post-revert fix
  // commits (PRs #82, #84, #86, #88, #89, #91, #93). Use parameterized
  // sql`...` template tags or Drizzle. See docs/BLAST-V3-AGENT-CONTRACT.md
  // §3 D-16.
  {
    files: ["lib/blast/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='sql'][callee.property.name='unsafe']",
          message:
            "sql.unsafe is banned in lib/blast/** — use parameterized sql`...` template tags or Drizzle (see docs/BLAST-V3-AGENT-CONTRACT.md §3 D-16)",
        },
      ],
    },
  },
]);

export default eslintConfig;
