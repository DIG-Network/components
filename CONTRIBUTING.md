# Contributing to @dignetwork/components

Thanks for your interest in improving this library. It ships as a real npm dependency of every
DIG Network frontend, so a regression here lands in every consuming app at once — please read
this before opening a PR.

## Reporting an issue

File it at [github.com/DIG-Network/components/issues](https://github.com/DIG-Network/components/issues)
with:

- what you observed vs. what you expected,
- the package version (`@dignetwork/components` version, from your `package.json` or
  `node_modules/@dignetwork/components/package.json`),
- a minimal repro — which component, which props, and the host app's React version.

## Prerequisites

- **Node >= 18** (the package's declared `engines` range). CI runs the full suite on both Node 18
  and 20.
- `react` and `react-dom` are **peer dependencies**, never bundled — a consuming app supplies its
  own copy so there is never a second React instance (broken hooks) or a bloated bundle. This
  repo's `devDependencies` pin a React version only so the library itself can build/test/e2e
  against something; do not move `react`/`react-dom` into `dependencies`.
- **CSP-safe by contract**: no `eval`, no dynamic code generation (`new Function(...)`, etc.), no
  external fonts or CDN assets anywhere in the bundle. A component that needs any of those doesn't
  belong in this library. `tsup.config.ts` keeps the build itself eval-free
  (`esbuildOptions.legalComments = "none"`, no dynamic `Function()`).

## Build & test

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run coverage    # vitest run --coverage (CI-gated at >=80% lines/functions/branches/statements)
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
npm run verify      # typecheck + build + coverage, in that order
npm run e2e         # Playwright: axe a11y (WCAG 2.2 incl. target-size) + the capture pipeline +
                     # design screenshots (desktop/mobile, light/dark), served from e2e/harness
```

New components get their own `src/<ComponentName>/` directory (component + `types.ts` + co-located
tests) and are re-exported from `src/index.ts` — see the "Adding more components" section of
`README.md` for the layout. `npm run e2e` drives the real component through `e2e/harness/main.tsx`
in a real Chromium instance; if you add a component that needs its own visual/a11y verification,
mount it there (or add a sibling harness entry) and give it an `e2e/*.spec.ts` alongside
`e2e/bugreport.spec.ts` — a new component with no e2e coverage has no design-screenshot artifact
for anyone to review.

## The gate

CI runs these on every PR (`.github/workflows/ci.yml`); run them locally first:

```bash
npm run format:check
npm run lint         # eslint . (flat config, includes eslint-plugin-react-hooks)
npm run typecheck
npm run build
npm run coverage      # fails below the 80% threshold in vitest.config.ts
npm run e2e           # separate CI job: axe a11y + design screenshots, uploaded as artifacts
```

Two more required checks gate the merge, both separately workflowed:

- **Commit/PR-title format** (`.github/workflows/commitlint.yml`) — see below.
- **Version increment** (`.github/workflows/ensure-version-increment.yml`) — `package.json`'s
  `version` must be strictly greater than on `main`.

`main` is protected: every required check must be green, every review thread must be resolved
(including any bot/CodeQL comment), and merges are squash-only.

## Commit conventions

Conventional Commits, enforced by `commitlint.config.mjs` in CI: `type(scope): summary`, where
`type` is one of `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`. A breaking change
appends `!` (e.g. `feat!:`) and/or a `BREAKING CHANGE:` footer. The type drives the release's
SemVer bump once merged (`fix` -> patch, `feat` -> minor, `!`/`BREAKING CHANGE` -> major) — bump
`package.json`'s `version` to match before opening the PR.

## Pull requests

1. Branch from `main`.
2. Make the gate green locally (above).
3. Bump `package.json`'s `version` (patch/minor/major per the change — see Commit conventions).
4. Open a PR with a clear description of what changed and why, and how you verified it (which
   commands you ran, and — for a new/changed component — the design screenshots from `npm run e2e`).
5. Resolve every review thread. On merge, `release.yml` regenerates `CHANGELOG.md`, tags the
   commit `vX.Y.Z`, and `publish-npm.yml` publishes that tag to npmjs via OIDC trusted publishing.

## License

MIT — see `LICENSE`.
