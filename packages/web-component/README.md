# @eaw/web-component

Framework-independent `<email-automation-widget>` custom element, built
with Lit. This is the foundation every framework wrapper (React, Vue,
Angular, Svelte, Solid, Preact) binds to — no framework required to use
it directly.

## Usage (plain HTML, no build step)

<script type="module" src="./node_modules/@eaw/web-component/dist/index.js"></script>

<email-automation-widget
mode="mailbox"
base-url="https://api.example.com"
token="your-bearer-token"

> </email-automation-widget>

## Attributes

- mode: dashboard | composer | mailbox | logs | templates | analytics (default: dashboard)
- base-url: backend base URL (default: /api)
- token: Bearer token
- theme: JSON-stringified Partial<WidgetTheme> override

## Events

- eaw-error: { message: string } — fired when an adapter call fails
- eaw-email-sent: EmailLogEntry — planned once Composer ships (Milestone 10+)
