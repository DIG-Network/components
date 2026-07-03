import { defineConfig } from "tsup";

// Build @dignetwork/components to ESM + CJS + .d.ts. React/ReactDOM are peer
// dependencies and MUST NOT be bundled — the host app supplies its own copy so we
// never end up with two React instances (broken hooks) or a bloated bundle.
//
// CSP-safe: no eval anywhere in source, `legalComments: "none"` keeps the output
// terse, and there is no dynamic Function()/eval-based code generation — the bundle
// runs fine under a strict `script-src 'self'` CSP with no `unsafe-eval`.
export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
  esbuildOptions(options) {
    options.legalComments = "none";
  },
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
