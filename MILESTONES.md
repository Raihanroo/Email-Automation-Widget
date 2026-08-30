# Email Automation Widget — Milestones

এই document-টি বর্তমান source code ও audit findings অনুযায়ী project-এর কী কী
হয়েছে, কী বাকি, এবং কোন ক্রমে করা উচিত—সেটার বাস্তবসম্মত delivery plan।

## Source-accurate audit notes

Audit-এর কিছু finding বর্তমান branch-এর আগের snapshot-এর সঙ্গে মিলে, তাই এখানে
সেগুলো সংশোধন করা হয়েছে:

- Root `README.md`, `LICENSE`, `CONTRIBUTING.md`, এবং `CHANGELOG.md` আছে।
- GitHub Actions CI-তে lint, build, ও test step সক্রিয়।
- সব package-এ `publishConfig` ও `files` metadata আছে; তবে published release
  ও release automation এখনো হয়নি।
- Bulk send এবং Dashboard এখন সব সাতটি wrapper-এ implement ও tested।
- `logs`, `templates`, `analytics` mode-এর adapter/type আছে, কিন্তু end-user UI
  এখনো তৈরি হয়নি।

## Milestone 1 — Monorepo and engineering foundation

Status: ✅ সম্পন্ন

Done:

- pnpm workspace ও Turborepo pipeline (`dev`, `lint`, `build`, `test`)।
- Shared TypeScript configuration, Vite playgrounds, ESLint, Prettier, Husky,
  commitlint, এবং Changesets setup।
- GitHub Actions-এ clean install, lint, build, এবং test verification।
- Root-level project, license, and contribution documentation।

Follow-up:

- CI-তে coverage reporting ও release/publish job যোগ করা।
- Playwright-based E2E smoke test যোগ করা।

## Milestone 2 — Framework-agnostic Core SDK

Status: ✅ সম্পন্ন; feature expansion চলবে

Done:

- Typed domain models: email, bulk recipient, attachment, template, log,
  analytics, pagination, auth, and widget props।
- API client with timeout, retry, and typed errors।
- Bearer, Basic, এবং API-key auth support।
- Default adapter: single send, bulk send, mailbox, logs, analytics, এবং
  template API contracts।
- Theme engine, event bus, store, validation, recipient parsing, CSV parsing,
  and placeholder rendering utilities।
- Compose, bulk compose, default adapter, এবং dashboard business logic-এর unit
  tests।

Next:

- Attachment upload/transport contract finalize করা।
- Logs, templates, এবং analytics-এর shared filtering/pagination helpers যোগ করা।

## Milestone 3 — Shared UI parity: Mailbox and Composer

Status: ✅ সম্পন্ন

Done in Web Component, React, Preact, Vue, Svelte, Solid, and Angular:

- Mailbox list, empty state, loading state, and backend error UI।
- Single-email compose form: To, CC, BCC, subject, body, and validation।
- Success callback/event, error callback/event, and failed submission-এর পরে
  draft preserve করা।
- Shared `baseURL`, token, theme, and layout configuration।

## Milestone 4 — Bulk Send and CSV personalization

Status: ✅ সম্পন্ন

Done in all seven wrappers:

- Paste করা recipient list parse, validation, duplicate removal, এবং invalid
  address warning।
- CSV upload; `email` বা `email address` column detect করা।
- CSV-এর অন্য columnগুলোকে per-recipient placeholder data হিসেবে পাঠানো
  (যেমন `{{name}}`)।
- Batch-level CC/BCC, progress text, sent/failed summary, এবং per-recipient
  errors।
- Fully successful batch-এর পরে form reset; server error হলে data preserve।

## Milestone 5 — Dashboard

Status: ✅ implemented; UI polish চলমান

Done:

- Shared dashboard loader analytics, recent logs, ও recent mailbox একসঙ্গে load
  করে।
- Total sent, opened, failed, open rate, এবং bounce rate card।
- Recent mailbox/activity plus loading, empty, এবং error state।
- সাতটি wrapper এবং Web Component-এ dashboard coverage।

Next:

- Responsive layout, accessible status presentation, এবং design consistency
  review।
- Date-range-aware dashboard data contract যোগ করা।

## Milestone 6 — Logs and operational message history

Status: ⏳ পরবর্তী প্রধান কাজ

Scope:

- Logs mode UI using the existing adapter method।
- Search, pagination, and filters for sent/opened/failed/bounced/queued status।
- Message detail: recipient, subject, timestamps, delivery error, and preview।
- Cross-wrapper behaviour and test parity।

Definition of done:

- Core query/filter helper এবং unit tests থাকবে।
- সাতটি wrapper-এ একই filter/query behaviour থাকবে।
- Loading, empty, error, and pagination states tested হবে।

## Milestone 7 — Template Manager and placeholders

Status: ⏳ planned

Scope:

- Template list, create, edit, update, delete, and select UI।
- Subject/body editor এবং supported placeholder list।
- Compose ও bulk send-এর সঙ্গে template selection integration।
- Safe preview of rendered placeholder values।

Definition of done:

- Existing `templates` adapter contract-এর সম্পূর্ণ CRUD ব্যবহার হবে।
- Empty/error/success states এবং destructive delete confirmation থাকবে।
- Core ও সাতটি wrapper-এর tests থাকবে।

## Milestone 8 — Analytics, attachments, and reply workflows

Status: ⏳ planned

Scope:

- Dedicated Analytics mode with date range, delivery/open/bounce metrics, and
  charts or accessible tabular alternatives।
- Attachment selection/upload/send flow; existing attachment types ব্যবহার করে
  final API transport contract নির্ধারণ।
- Message detail ও reply-thread experience, backend capability অনুযায়ী।

Dependency:

- Attachment upload এবং reply thread শুরু করার আগে backend API shape, file-size
  limit, polling/webhook behaviour, এবং authorization rules লিখিতভাবে নিশ্চিত
  করতে হবে।

## Milestone 9 — Documentation, examples, and releases

Status: 🟡 foundation ready; deliverables pending

Done:

- Root docs, contribution guide, package metadata, Changesets, এবং playground
  application structure আছে।

Remaining:

- React/Vue/Angular/Svelte/Solid/Preact/Web Component integration guide।
- Laravel, Django, Next.js, এবং Astro example integrations।
- Public API reference and backend adapter guide।
- Versioning, changelog, npm publish, and release automation।
- Storybook/component showcase এবং Playwright E2E coverage।

## Working priority order

| Priority | কাজ                          | কেন আগে                                                               |
| -------- | ---------------------------- | --------------------------------------------------------------------- |
| P0       | Logs UI                      | Existing core contract ব্যবহার করে সবচেয়ে দ্রুত operational value দেয় |
| P1       | Template Manager             | Repeatable content ও personalization workflow সম্পূর্ণ করে            |
| P1       | Dedicated Analytics          | Dashboard-এর summary থেকে actionable reporting-এ নিয়ে যায়             |
| P2       | Attachments and reply thread | Backend contract ও security decision প্রয়োজন                          |
| P2       | Examples, docs, releases     | External adoption ও production readiness-এর জন্য প্রয়োজন              |
| P3       | Storybook and E2E            | UI regression protection ও design-system workflow উন্নত করে           |

## Verification and definition of done

বর্তমান baseline-এ full workspace-এ 211টি automated test pass করে। নতুন
milestone complete বলার আগে অবশ্যই:

```bash
pnpm lint
pnpm build
pnpm test
```

চালাতে হবে। কোনো user-facing feature complete হবে তখনই যখন shared business
logic `@eaw/core`-এ থাকবে, সাতটি wrapper-এ equivalent UX থাকবে, loading/empty/
error state tested হবে, এবং relevant README/package documentation update হবে。
