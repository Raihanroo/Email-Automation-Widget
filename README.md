# Email Automation Widget

A cross-framework SDK + Web Component platform for embeddable email automation UIs — one core engine (`@eaw/core`), one framework-independent Web Component, and thin wrappers for every major frontend framework.

```
Core SDK
    │
    ▼
Web Component (Lit)
    │
 ┌──┼──────┬───────┬────────┬─────────┬────────┐
React    Vue    Angular   Svelte    Solid    Preact
```

All business logic (API calls, validation, form state, adapters) lives in `@eaw/core`. Every framework wrapper is a thin UI binding on top of it, so behavior is identical everywhere and bugs get fixed once, not seven times.

## Status

This project is under active development. Current state:

| Feature                           | Status              |
| --------------------------------- | ------------------- |
| Mailbox (list view)               | ✅ All 7 frameworks |
| Compose (single email)            | ✅ All 7 frameworks |
| Bulk Send (CSV import + paste)    | ✅ All 7 frameworks |
| Dashboard                         | 🚧 In progress      |
| Logs / Analytics                  | 🚧 Planned          |
| Template Manager / Design Builder | 🚧 Planned          |
| Settings / Reply Thread           | 🚧 Planned          |

See [`docs/roadmap.md`](./docs/roadmap.md) for the full milestone plan.

## Packages

| Package                                          | Framework                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| [`@eaw/core`](./packages/core)                   | Framework-agnostic SDK (types, adapters, validation, theme engine) |
| [`@eaw/web-component`](./packages/web-component) | `<email-automation-widget>` custom element (Lit)                   |
| [`@eaw/react`](./packages/react)                 | React wrapper                                                      |
| [`@eaw/vue`](./packages/vue)                     | Vue 3 wrapper                                                      |
| [`@eaw/angular`](./packages/angular)             | Angular standalone-component wrapper                               |
| [`@eaw/svelte`](./packages/svelte)               | Svelte 5 (runes) wrapper                                           |
| [`@eaw/solid`](./packages/solid)                 | SolidJS wrapper                                                    |
| [`@eaw/preact`](./packages/preact)               | Preact wrapper                                                     |

## Getting started

```bash
pnpm install
pnpm build
pnpm test
```

### Run a framework playground

Each framework has a demo app under `apps/`:

```bash
pnpm --filter playground-react dev
pnpm --filter playground-vue dev
pnpm --filter playground-angular dev
pnpm --filter playground-svelte dev
pnpm --filter playground-solid dev
pnpm --filter playground-preact dev
```

### Using the widget

**React**

```tsx
import { EmailAutomationWidget } from "@eaw/react";

<EmailAutomationWidget mode="bulk" baseURL="/api" token={jwt} />;
```

**Vue**

```vue
<EmailAutomationWidget mode="composer" :base-u-r-l="'/api'" />
```

**Web Component** (framework-independent)

```html
<script type="module" src="@eaw/web-component"></script>
<email-automation-widget
  mode="mailbox"
  base-url="/api"
></email-automation-widget>
```

Every wrapper accepts the same core props: `mode` (`"mailbox" | "composer" | "bulk" | "dashboard"`), `baseURL`, `token`, `theme`, and emits the same events (`onEmailSent`, `onBulkSent`, `onError`).

## Development

This is a pnpm + Turborepo monorepo.

```bash
pnpm lint          # eslint across all packages
pnpm build         # turbo build, respects package dependency graph
pnpm test          # vitest across all packages
pnpm format        # prettier
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced via commitlint + husky). Use `pnpm commit` for a guided commit message.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
