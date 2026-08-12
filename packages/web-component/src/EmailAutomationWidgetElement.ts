import { LitElement, html, css, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  EmailAdapter,
  MailboxItem,
  WidgetMode,
  WidgetTheme,
} from "@eaw/core";

/**
 * `<email-automation-widget>` — the framework-independent core of the
 * project. Every framework wrapper (React, Vue, Angular, Svelte, Solid,
 * Preact) renders this element under the hood, so behaviour only needs
 * to be implemented once.
 *
 * Attributes:
 *  - mode: "dashboard" | "composer" | "mailbox" | "logs" | "templates" | "analytics"
 *  - base-url: backend base URL (default "/api")
 *  - token: Bearer token for auth
 *  - theme: JSON-stringified Partial<WidgetTheme> override
 *
 * Events:
 *  - eaw-error: CustomEvent<{ message: string }>
 *  - eaw-email-sent: CustomEvent<EmailLogEntry>
 */
@customElement("email-automation-widget")
export class EmailAutomationWidgetElement extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--eaw-font-family, sans-serif);
      color: var(--eaw-color-text-primary, #111827);
    }
    .eaw-root {
      padding: 20px;
      border: 1px solid var(--eaw-color-border, #e5e7eb);
      border-radius: var(--eaw-radius, 8px);
      background: var(--eaw-color-bg, #fff);
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      padding: 8px 0;
      border-bottom: 1px solid var(--eaw-color-border, #e5e7eb);
    }
    .muted {
      color: var(--eaw-color-text-secondary, #6b7280);
    }
    .danger {
      color: var(--eaw-color-danger, #dc2626);
    }
  `;

  @property({ type: String }) mode: WidgetMode = "dashboard";
  @property({ type: String, attribute: "base-url" }) baseURL = "/api";
  @property({ type: String }) token?: string;
  @property({ type: String })
  get theme(): string {
    return JSON.stringify(this._themeOverride);
  }
  set theme(value: string) {
    try {
      this._themeOverride = value
        ? (JSON.parse(value) as Partial<WidgetTheme>)
        : undefined;
    } catch {
      this._themeOverride = undefined;
    }
  }

  @state() private _themeOverride?: Partial<WidgetTheme>;
  @state() private emails: MailboxItem[] = [];
  @state() private loading = false;
  @state() private errorMessage: string | null = null;

  private adapter!: EmailAdapter;

  connectedCallback(): void {
    super.connectedCallback();
    this.rebuildAdapter();
    this.applyThemeVars();
    // NOTE: don't also call `this.loadMailbox()` here when mode is
    // "mailbox" — Lit's `updated()` lifecycle already fires on the
    // element's first update pass (attribute-derived properties count
    // as "changed" on that first pass too), and its `changed.has("mode")`
    // branch below calls `loadMailbox()`. Calling it here as well fired
    // the request twice on initial mount.
  }

  updated(changed: PropertyValues): void {
    if (changed.has("baseURL") || changed.has("token")) {
      this.rebuildAdapter();
    }
    if (changed.has("_themeOverride")) {
      this.applyThemeVars();
    }
    if (changed.has("mode") && this.mode === "mailbox") {
      this.loadMailbox();
    }
  }

  private rebuildAdapter() {
    const client = new ApiClient(
      this.baseURL,
      this.token ? { type: "Bearer", token: this.token } : undefined
    );
    this.adapter = createDefaultAdapter(client);
  }

  private applyThemeVars() {
    const resolved = resolveTheme(this._themeOverride);
    const vars = themeToCssVars(resolved);
    for (const [key, value] of Object.entries(vars)) {
      this.style.setProperty(key, value);
    }
  }

  private async loadMailbox() {
    this.loading = true;
    this.errorMessage = null;
    try {
      const result = await this.adapter.mailbox();
      this.emails = result.items;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load mailbox";
      this.errorMessage = message;
      this.dispatchEvent(
        new CustomEvent("eaw-error", {
          detail: { message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="eaw-root">
        <h2>Email Automation Widget</h2>
        ${this.mode === "mailbox"
          ? this.renderMailbox()
          : html`<p class="muted">
              Dashboard content coming in a later milestone.
            </p>`}
      </div>
    `;
  }

  private renderMailbox() {
    if (this.loading) return html`<p>Loading mailbox…</p>`;
    if (this.errorMessage)
      return html`<p class="danger">${this.errorMessage}</p>`;
    if (this.emails.length === 0)
      return html`<p class="muted">No messages yet.</p>`;
    return html`
      <ul>
        ${this.emails.map(
          (mail) =>
            html`<li>
              <strong>${mail.subject}</strong>
              <span class="muted">— ${mail.from}</span>
            </li>`
        )}
      </ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "email-automation-widget": EmailAutomationWidgetElement;
  }
}
