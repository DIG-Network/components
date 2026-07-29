import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Flat-config ESLint gate (CLAUDE.md §2.4a). This is a React component library, so on top of the
// standard JS + typescript-eslint recommended sets it enables eslint-plugin-react-hooks — the whole
// reason linting matters for a SHARED component library: rules-of-hooks and exhaustive-deps catch
// the hook bugs that would otherwise ship into every consuming app.
export default tseslint.config(
  // Never lint build output, coverage, or Playwright artifacts.
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },

  // Type-aware parsing + the recommended JS + TS rule sets across all TypeScript in the repo
  // (library source, unit tests, and the Playwright e2e harness/specs).
  {
    files: ["**/*.{ts,tsx,mts,mjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Leading-underscore names are the deliberate "intentionally unused" convention (e.g. stub
      // signatures that must match an interface but ignore their args).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Library source: browser-runtime code (the widget touches window/document/fetch/FormData/Blob).
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // React hooks correctness for the component + hook files. rules-of-hooks is an error (calling a
  // hook conditionally is always a bug); exhaustive-deps stays an error so a missing dep is caught,
  // with the one intentional stable-omission scope-disabled + rationalised in useFocusTrap.ts.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Tests + e2e harness exercise the browser widget from a Node test runner, so both global sets
  // apply (jsdom/Playwright browser APIs + Node process/globals).
  {
    files: ["test/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Build + test config files run under Node.
  {
    files: ["*.config.{ts,mts,mjs}", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Prettier LAST: it disables every stylistic rule so formatting is owned solely by prettier
  // (.prettierrc.json / format:check), never fought over by ESLint.
  prettier,
);
