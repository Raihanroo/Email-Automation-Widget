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

## বর্তমান প্রজেক্ট অবস্থা

এটি শূন্য থেকে শুরু করা project নয়। একটি কাজ-করা shared SDK, standalone Web
Component, এবং React, Preact, Vue, Svelte, Solid, ও Angular wrapper ইতিমধ্যে
আছে। সব wrapper-এর behaviour একই রাখার লক্ষ্য নিয়ে business logic
`@eaw/core`-এ রাখা হয়েছে।

| Capability            | অবস্থা         | কী আছে                                                                                               |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| Monorepo foundation   | ✅ সম্পন্ন     | pnpm workspace, Turborepo, TypeScript, Vite, ESLint, Prettier, Husky, Changesets ও GitHub Actions CI |
| Core SDK              | ✅ শক্ত ভিত্তি | typed API client, retry/timeout, auth, adapter, theme, event bus, store ও validation                 |
| Mailbox               | ✅ ৭/৭ wrapper | loading, empty, error এবং message list                                                               |
| Composer              | ✅ ৭/৭ wrapper | To, CC, BCC, subject, body, validation, success/error recovery                                       |
| Bulk send             | ✅ ৭/৭ wrapper | pasted list, CSV import, dedupe, invalid-entry warning, placeholders, batch CC/BCC, results          |
| Dashboard             | ✅ ৭/৭ wrapper | analytics cards, recent mailbox, recent activity, loading/empty/error states                         |
| Logs                  | ⏳ বাকি        | core adapter/type প্রস্তুত; UI, filtering ও pagination বাকি                                          |
| Templates             | ⏳ বাকি        | core adapter/type প্রস্তুত; manager UI ও CRUD flow বাকি                                              |
| Dedicated analytics   | ⏳ বাকি        | dashboard summary আছে; filterable/reporting UI বাকি                                                  |
| Attachments           | ⏳ বাকি        | core type আছে; upload/select/send UI বাকি                                                            |
| Publishing & examples | 🟡 আংশিক       | package publish metadata আছে; npm release, examples এবং integration guides বাকি                      |

বর্তমান full workspace verification-এ **211টি automated test pass** করেছে। CI
workflow-এ install, lint, build এবং test—চারটিই চালু আছে।

### সমর্থিত widget mode

`dashboard`, `composer`, `bulk`, `mailbox`, `logs`, `templates`, এবং
`analytics` mode type-level API-তে সংজ্ঞায়িত। প্রথম চারটি ব্যবহারযোগ্য UI হিসেবে
সাতটি wrapper-এ আছে; শেষ তিনটির UI পরের delivery phase-এর কাজ।

### পরবর্তী অগ্রাধিকার

1. **Logs UI** — status filter, search, pagination, এবং delivery details।
2. **Template Manager** — list/create/edit/delete/select flow ও placeholder UX।
3. **Analytics screen** — date range, metrics breakdown, এবং chart/reporting।
4. **Attachments ও message detail/reply thread** — API contract নিশ্চিত করে UI flow।
5. **Release readiness** — public usage guides, framework examples, E2E coverage,
   npm publish automation।

সম্পন্ন কাজ, scope, এবং প্রতিটি পরের ধাপের definition of done দেখতে
[`MILESTONES.md`](./MILESTONES.md) দেখুন। দীর্ঘমেয়াদি product direction আছে
[`ROADMAP.md`](./ROADMAP.md)-এ।

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
