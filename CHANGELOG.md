# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions are per-package via [Changesets](https://github.com/changesets/changesets) once publishing begins (see `docs/roadmap.md`, Phase F). Until then, this file tracks work at the monorepo level.

## [Unreleased]

### Added

- Bulk Compose (CSV import + paste, per-recipient placeholder personalization) implemented across all 7 wrappers: React, Vue, Preact, Solid, Web Component, Angular, Svelte.
- Composer (single email) mode across all 7 wrappers.
- Dashboard data-aggregation helpers in `@eaw/core` (UI not yet built — see roadmap Phase B).
- CI now runs the full test suite (`pnpm turbo run test`) on every push/PR, not just lint + build.
- Root `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`.

### Fixed

- Svelte wrapper: pinned `svelte` was stuck at `5.0.0`, an early release with a compiler bug (`Not implemented type annotation EmptyStatement`) that crashed compilation of any typed function parameter. Bumped to `5.45.6` and pinned `@sveltejs/vite-plugin-svelte` to `4.0.4`.
- Svelte wrapper: moved inline TypeScript casts out of template expressions (`onclick={... as HTMLInputElement}`) into named functions in `<script lang="ts">` — Svelte's compiler does not parse TS syntax inside markup expressions.
- Angular wrapper: replaced `FormsModule`/`ngModel` bindings with plain `(input)` + `$any($event.target).value`, avoiding an unnecessary peer dependency.

## Earlier history (pre-changelog)

Reconstructed from commit history for context:

- Core SDK: types, `EventBus`, `Store`, `ApiClient` (with timeout/retry), `DefaultAdapter`, theme engine (CSS variable generation), validation utilities, typed error classes.
- Web Component (`@eaw/web-component`, Lit-based) and all six framework wrappers (React, Vue, Angular, Svelte, Solid, Preact) scaffolded with mailbox mode and a matching playground app each.
- Vitest unit tests added per wrapper package.

See `git log` for the full commit-level history.
