# Contributing

Thanks for helping build the Email Automation Widget. This is a pnpm + Turborepo monorepo — one core SDK, one Web Component, and thin wrappers per framework. Please read this before opening a PR.

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Requires Node 20+ and pnpm (via `corepack enable`).

## Project structure

```
packages/
  core/            → framework-agnostic SDK: types, validation, adapters, theme engine
  web-component/   → Lit-based <email-automation-widget>
  react/ vue/ angular/ svelte/ solid/ preact/  → thin UI wrappers around @eaw/core
apps/
  playground-*/    → demo app per framework
docs/
scripts/
```

## The golden rule: logic lives in `@eaw/core`

**Never duplicate business logic in a framework wrapper.** If you're adding a feature (a new form, a new validation rule, a new API call), it belongs in `packages/core/src/` first, exported from `packages/core/src/index.ts`, and covered by a `*.test.ts` in `packages/core`. Every framework wrapper should just:

1. Hold local UI state (form fields, loading flags) using that framework's own reactivity primitive (`useState`, `ref`, Angular fields, Svelte runes, Solid signals, Preact hooks).
2. Call the shared `@eaw/core` functions for validation and submission.
3. Render markup idiomatic to that framework.

This is how Compose and Bulk Send were built — check `packages/core/src/Compose.ts` / `BulkCompose.ts` alongside any of the seven wrapper implementations for the reference pattern.

## Adding a feature across all 7 frameworks

When implementing a new `mode` (e.g. Dashboard, Templates, Logs):

1. Add types + logic to `@eaw/core` first, with tests.
2. Implement in **one** framework first (React is usually easiest to get right), get it reviewed.
3. Port to the remaining six, keeping prop names, event names (`onError`, `onEmailSent`, `onBulkSent`, ...), and CSS class names (`eaw-*`) consistent across all wrappers.
4. Add a `*.test.ts` per wrapper.

### Framework-specific gotchas

- **Svelte**: never put a TypeScript type annotation or `as` cast directly inside a template expression (`onclick={... as Foo}`) — Svelte's compiler only understands TS inside `<script lang="ts">`. Move any typed logic into a named function in the script block and reference it by name in the markup.
- **Angular**: this project avoids `FormsModule`/`ngModel` to keep the peer dependency surface small — use plain `(input)` events with `$any($event.target).value` instead.
- **Web Component**: Lit reactive properties (`@state()`) that hold derived values should be recomputed in the event handler, not via a Lit-native "computed" — Lit does not have one.

## Commits

Conventional Commits are enforced (commitlint + husky). Use `pnpm commit` for a guided prompt, or write manually:

```
feat(svelte): add bulk composer
fix(core): correct CSV header detection
docs: update root README
chore(ci): enable test step
```

## Before opening a PR

```bash
pnpm lint
pnpm build
pnpm test
```

All three must pass. If you touched a `.svelte` file, also run `pnpm --filter @eaw/svelte check`.
