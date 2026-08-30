# Roadmap

Email Automation Widget is a cross-framework, embeddable email UI platform. The roadmap prioritizes shared behaviour first, then consistent presentation across each wrapper.

## Now

- Stabilize the dashboard across all supported frameworks.
- Maintain test coverage for mailbox, composer, bulk sending, CSV import, and dashboard behaviour.
- Improve the framework playgrounds as features are completed.

## Next

- Add a Logs mode with pagination, filtering, and delivery-status details.
- Expand Analytics with useful campaign and delivery metrics.
- Add message detail and reply-thread workflows.

## Later

- Build a Template Manager with reusable email content.
- Add a visual email design builder.
- Introduce settings for sender identities, defaults, and widget configuration.
- Prepare publishing, versioning, and integration documentation for external consumers.

## Principles

- Put API calls, parsing, validation, and business rules in `@eaw/core`.
- Keep React, Vue, Angular, Svelte, Solid, Preact, and the Web Component behaviourally aligned.
- Add automated tests alongside every user-facing capability.
- Preserve accessible labels, clear loading states, and actionable error messages.

For implementation detail and completion criteria, see [MILESTONES.md](./MILESTONES.md).
