import { LitElement, html, css, PropertyValues, nothing } from "lit";
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
  emptyComposeForm,
  validateComposeForm,
  isComposeFormValid,
  submitComposeForm,
  ComposeFormState,
  ComposeValidationErrors,
  emptyBulkComposeForm,
  parseRecipients,
  parseRecipientsFromCsv,
  validateBulkComposeForm,
  isBulkComposeFormValid,
  submitBulkComposeForm,
  BulkComposeFormState,
  BulkComposeValidationErrors,
  BulkSendResult,
  BulkRecipient,
  CsvRecipientParseResult,
} from "@eaw/core";

type BulkRecipientSource = "paste" | "csv";

const EMPTY_RECIPIENTS: BulkRecipient[] = [];
const EMPTY_INVALID_ENTRIES: string[] = [];

/**
 * Reads a File's text content via FileReader — mirrors the React/Vue/
 * Preact/Solid wrappers' readFileAsText helper, kept identical here so
 * CSV parsing behaves the same in every framework (jsdom's FileReader
 * support is more reliable than File.prototype.text() across versions).
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

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
    .success {
      color: var(--eaw-color-success, #16a34a);
    }
    form {
      display: block;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--eaw-color-text-secondary, #6b7280);
    }
    input[type="text"],
    input[type="file"],
    textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      margin-top: 4px;
      margin-bottom: 12px;
      border-radius: var(--eaw-radius, 8px);
      border: 1px solid var(--eaw-color-border, #e5e7eb);
      background: var(--eaw-color-bg, #fff);
      color: var(--eaw-color-text-primary, #111827);
      font-family: var(--eaw-font-family, sans-serif);
      font-size: 14px;
    }
    input[type="file"] {
      padding: 6px 0;
    }
    textarea {
      min-height: 100px;
      resize: vertical;
    }
    textarea.eaw-body {
      min-height: 120px;
    }
    .field-error {
      color: var(--eaw-color-danger, #dc2626);
      font-size: 12px;
      margin-top: -8px;
      margin-bottom: 12px;
    }
    .eaw-hint {
      margin: -8px 0 4px;
      font-size: 12px;
      color: var(--eaw-color-text-secondary, #6b7280);
    }
    .eaw-submit {
      padding: 8px 16px;
      border-radius: var(--eaw-radius, 8px);
      border: none;
      background: var(--eaw-color-primary, #4f46e5);
      color: #fff;
      font-family: var(--eaw-font-family, sans-serif);
      font-size: 14px;
      cursor: pointer;
    }
    .eaw-submit:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    .eaw-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 10px;
    }
    .eaw-tab {
      padding: 6px 12px;
      border-radius: var(--eaw-radius, 8px);
      border: 1px solid var(--eaw-color-border, #e5e7eb);
      background: var(--eaw-color-bg, #fff);
      color: var(--eaw-color-text-primary, #111827);
      font-family: var(--eaw-font-family, sans-serif);
      font-size: 13px;
      cursor: pointer;
    }
    .eaw-tab[aria-selected="true"] {
      background: var(--eaw-color-primary, #4f46e5);
      color: #fff;
    }
    .eaw-errors {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .eaw-errors li {
      border-bottom: none;
      padding: 2px 0;
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

  // --- Composer (single email) state -------------------------------
  @state() private composeForm: ComposeFormState = emptyComposeForm();
  @state() private composeErrors: ComposeValidationErrors = {};
  @state() private composeTouched = false;
  @state() private sending = false;
  @state() private sendResultMessage: string | null = null;

  // --- Bulk composer state ------------------------------------------
  @state() private bulkForm: BulkComposeFormState = emptyBulkComposeForm();
  @state() private bulkErrors: BulkComposeValidationErrors = {};
  @state() private bulkTouched = false;
  @state() private bulkSending = false;
  @state() private bulkProgress: { sent: number; total: number } | null = null;
  @state() private bulkResult: BulkSendResult | null = null;
  @state() private bulkErrorMessage: string | null = null;
  @state() private bulkRecipientSource: BulkRecipientSource = "paste";
  @state() private csvFileName: string | null = null;
  @state() private csvParseResult: CsvRecipientParseResult | null = null;
  @state() private csvReadError: string | null = null;

  private adapter!: EmailAdapter;

  private get pasteParsed() {
    return parseRecipients(this.bulkForm.recipientsRaw);
  }

  private get bulkRecipients(): BulkRecipient[] {
    return this.bulkRecipientSource === "csv"
      ? this.csvParseResult?.recipients ?? EMPTY_RECIPIENTS
      : this.pasteParsed.recipients;
  }

  private get bulkInvalidEntries(): string[] {
    return this.bulkRecipientSource === "csv"
      ? this.csvParseResult?.invalidEntries ?? EMPTY_INVALID_ENTRIES
      : this.pasteParsed.invalidEntries;
  }

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

  // --- Composer handlers ----------------------------------------------

  private updateComposeField(field: keyof ComposeFormState, value: string) {
    this.composeTouched = true;
    this.sendResultMessage = null;
    this.composeForm = { ...this.composeForm, [field]: value };
    if (this.composeTouched) {
      this.composeErrors = validateComposeForm(this.composeForm);
    }
  }

  private async handleComposeSubmit(e: Event) {
    e.preventDefault();
    this.composeTouched = true;
    const errors = validateComposeForm(this.composeForm);
    this.composeErrors = errors;
    if (!isComposeFormValid(errors)) return;

    this.sending = true;
    this.sendResultMessage = null;
    try {
      const entry = await submitComposeForm(this.adapter, this.composeForm);
      this.dispatchEvent(
        new CustomEvent("eaw-email-sent", {
          detail: entry,
          bubbles: true,
          composed: true,
        })
      );
      this.sendResultMessage = `Sent to ${entry.to}.`;
      this.composeForm = emptyComposeForm();
      this.composeTouched = false;
      this.composeErrors = {};
    } catch (err) {
      const e2 = err instanceof Error ? err : new Error("Failed to send email");
      this.sendResultMessage = e2.message;
      this.dispatchEvent(
        new CustomEvent("eaw-error", {
          detail: { message: e2.message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.sending = false;
    }
  }

  // --- Bulk composer handlers ------------------------------------------

  private updateBulkField(field: keyof BulkComposeFormState, value: string) {
    this.bulkTouched = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.bulkForm = { ...this.bulkForm, [field]: value };
    this.refreshBulkErrors();
  }

  private switchBulkRecipientSource(source: BulkRecipientSource) {
    this.bulkRecipientSource = source;
    this.bulkTouched = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.refreshBulkErrors();
  }

  private refreshBulkErrors() {
    if (!this.bulkTouched) return;
    this.bulkErrors = validateBulkComposeForm(
      this.bulkForm,
      this.bulkRecipients
    );
  }

  private async handleCsvFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.bulkTouched = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;

    if (!file) {
      this.csvFileName = null;
      this.csvParseResult = null;
      this.csvReadError = null;
      this.refreshBulkErrors();
      return;
    }

    this.csvFileName = file.name;
    try {
      const text = await readFileAsText(file);
      this.csvReadError = null;
      this.csvParseResult = parseRecipientsFromCsv(text);
    } catch {
      this.csvReadError = "Could not read that file. Please upload a CSV file.";
      this.csvParseResult = null;
    }
    this.refreshBulkErrors();
  }

  private async handleBulkSubmit(e: Event) {
    e.preventDefault();
    this.bulkTouched = true;
    const errors = validateBulkComposeForm(this.bulkForm, this.bulkRecipients);
    this.bulkErrors = errors;
    if (!isBulkComposeFormValid(errors)) return;

    this.bulkSending = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.bulkProgress = { sent: 0, total: this.bulkRecipients.length };
    try {
      const result = await submitBulkComposeForm(
        this.adapter,
        this.bulkForm,
        this.bulkRecipients,
        (sent, total) => {
          this.bulkProgress = { sent, total };
        }
      );
      this.dispatchEvent(
        new CustomEvent("eaw-bulk-sent", {
          detail: result,
          bubbles: true,
          composed: true,
        })
      );
      this.bulkResult = result;
      this.bulkForm = emptyBulkComposeForm();
      this.bulkTouched = false;
      this.bulkErrors = {};
      this.csvFileName = null;
      this.csvParseResult = null;
      this.csvReadError = null;
    } catch (err) {
      const e2 =
        err instanceof Error ? err : new Error("Failed to send bulk email");
      this.bulkErrorMessage = e2.message;
      this.dispatchEvent(
        new CustomEvent("eaw-error", {
          detail: { message: e2.message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.bulkSending = false;
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
        ${this.mode === "mailbox" ? this.renderMailbox() : nothing}
        ${this.mode === "composer" ? this.renderComposer() : nothing}
        ${this.mode === "bulk" ? this.renderBulkComposer() : nothing}
        ${this.mode === "dashboard"
          ? html`<p class="muted">
              Dashboard content coming in a later milestone.
            </p>`
          : nothing}
      </div>
    `;
  }

  private renderComposer() {
    const errors = this.composeErrors;
    return html`
      <form @submit=${(e: Event) => this.handleComposeSubmit(e)} novalidate>
        <label for="eaw-compose-to">To</label>
        <input
          id="eaw-compose-to"
          type="text"
          .value=${this.composeForm.to}
          placeholder="recipient@example.com"
          @input=${(e: Event) =>
            this.updateComposeField("to", (e.target as HTMLInputElement).value)}
        />
        ${errors.to ? html`<p class="field-error">${errors.to}</p>` : nothing}

        <label for="eaw-compose-cc">CC</label>
        <input
          id="eaw-compose-cc"
          type="text"
          .value=${this.composeForm.cc}
          placeholder="cc1@example.com, cc2@example.com"
          @input=${(e: Event) =>
            this.updateComposeField("cc", (e.target as HTMLInputElement).value)}
        />

        <label for="eaw-compose-bcc">BCC</label>
        <input
          id="eaw-compose-bcc"
          type="text"
          .value=${this.composeForm.bcc}
          placeholder="bcc1@example.com"
          @input=${(e: Event) =>
            this.updateComposeField(
              "bcc",
              (e.target as HTMLInputElement).value
            )}
        />

        <label for="eaw-compose-subject">Subject</label>
        <input
          id="eaw-compose-subject"
          type="text"
          .value=${this.composeForm.subject}
          @input=${(e: Event) =>
            this.updateComposeField(
              "subject",
              (e.target as HTMLInputElement).value
            )}
        />
        ${errors.subject
          ? html`<p class="field-error">${errors.subject}</p>`
          : nothing}

        <label for="eaw-compose-body">Message</label>
        <textarea
          id="eaw-compose-body"
          class="eaw-body"
          .value=${this.composeForm.body}
          @input=${(e: Event) =>
            this.updateComposeField(
              "body",
              (e.target as HTMLTextAreaElement).value
            )}
        ></textarea>
        ${errors.body
          ? html`<p class="field-error">${errors.body}</p>`
          : nothing}

        <button class="eaw-submit" type="submit" ?disabled=${this.sending}>
          ${this.sending ? "Sending…" : "Send"}
        </button>

        ${this.sendResultMessage
          ? html`<p
              class=${this.sendResultMessage.startsWith("Sent to")
                ? "success"
                : "danger"}
              style="margin-top: 12px;"
            >
              ${this.sendResultMessage}
            </p>`
          : nothing}
      </form>
    `;
  }

  private renderBulkComposer() {
    const errors = this.bulkErrors;
    const recipients = this.bulkRecipients;
    const invalidEntries = this.bulkInvalidEntries;
    const csv = this.csvParseResult;

    return html`
      <form @submit=${(e: Event) => this.handleBulkSubmit(e)} novalidate>
        <div class="eaw-tabs" role="tablist" aria-label="Recipient source">
          <button
            type="button"
            role="tab"
            class="eaw-tab"
            aria-selected=${this.bulkRecipientSource === "paste"}
            @click=${() => this.switchBulkRecipientSource("paste")}
          >
            Paste list
          </button>
          <button
            type="button"
            role="tab"
            class="eaw-tab"
            aria-selected=${this.bulkRecipientSource === "csv"}
            @click=${() => this.switchBulkRecipientSource("csv")}
          >
            Upload CSV
          </button>
        </div>

        ${this.bulkRecipientSource === "paste"
          ? html`
              <label for="eaw-bulk-recipients">Recipients</label>
              <textarea
                id="eaw-bulk-recipients"
                .value=${this.bulkForm.recipientsRaw}
                placeholder=${"one@example.com, two@example.com\nthree@example.com"}
                @input=${(e: Event) =>
                  this.updateBulkField(
                    "recipientsRaw",
                    (e.target as HTMLTextAreaElement).value
                  )}
              ></textarea>
            `
          : nothing}
        ${this.bulkRecipientSource === "csv"
          ? html`
              <label for="eaw-bulk-csv">CSV file</label>
              <input
                id="eaw-bulk-csv"
                type="file"
                accept=".csv,text/csv"
                @change=${(e: Event) => this.handleCsvFileChange(e)}
              />
              <p class="eaw-hint">
                First row must be a header row. A column named "email" (or
                "email address") is used as the recipient; every other column
                becomes a personalization placeholder, e.g.
                <code>{{name}}</code>.
              </p>
              ${this.csvFileName
                ? html`<p class="eaw-hint">
                    Loaded:
                    ${this.csvFileName}${csv && !csv.missingEmailColumn
                      ? ` — columns: ${csv.headers.join(", ")}`
                      : ""}
                  </p>`
                : nothing}
              ${this.csvReadError
                ? html`<p class="field-error">${this.csvReadError}</p>`
                : nothing}
              ${csv?.missingEmailColumn
                ? html`<p class="field-error">
                    No "email" column
                    found${csv.headers.length > 0
                      ? ` — detected columns: ${csv.headers.join(", ")}`
                      : ""}.
                    Add an "email" (or "email address") column and re-upload.
                  </p>`
                : nothing}
            `
          : nothing}

        <p class="eaw-hint" style="margin-bottom: 12px;">
          ${recipients.length} valid
          recipient${recipients.length === 1 ? "" : "s"}
        </p>
        ${invalidEntries.length > 0
          ? html`<p class="field-error">
              Ignoring ${invalidEntries.length} invalid
              address${invalidEntries.length === 1 ? "" : "es"}:
              ${invalidEntries.join(", ")}
            </p>`
          : nothing}
        ${errors.recipients && !csv?.missingEmailColumn
          ? html`<p class="field-error">${errors.recipients}</p>`
          : nothing}

        <label for="eaw-bulk-cc">CC (applies once to the whole batch)</label>
        <input
          id="eaw-bulk-cc"
          type="text"
          .value=${this.bulkForm.cc}
          placeholder="manager@example.com"
          @input=${(e: Event) =>
            this.updateBulkField("cc", (e.target as HTMLInputElement).value)}
        />

        <label for="eaw-bulk-bcc">BCC (applies once to the whole batch)</label>
        <input
          id="eaw-bulk-bcc"
          type="text"
          .value=${this.bulkForm.bcc}
          placeholder="audit@example.com"
          @input=${(e: Event) =>
            this.updateBulkField("bcc", (e.target as HTMLInputElement).value)}
        />

        <label for="eaw-bulk-subject">Subject</label>
        <input
          id="eaw-bulk-subject"
          type="text"
          .value=${this.bulkForm.subject}
          @input=${(e: Event) =>
            this.updateBulkField(
              "subject",
              (e.target as HTMLInputElement).value
            )}
        />
        ${errors.subject
          ? html`<p class="field-error">${errors.subject}</p>`
          : nothing}

        <label for="eaw-bulk-body">Message</label>
        <textarea
          id="eaw-bulk-body"
          class="eaw-body"
          .value=${this.bulkForm.body}
          @input=${(e: Event) =>
            this.updateBulkField(
              "body",
              (e.target as HTMLTextAreaElement).value
            )}
        ></textarea>
        ${errors.body
          ? html`<p class="field-error">${errors.body}</p>`
          : nothing}

        <button class="eaw-submit" type="submit" ?disabled=${this.bulkSending}>
          ${this.bulkSending && this.bulkProgress
            ? `Sending ${this.bulkProgress.sent} of ${this.bulkProgress.total}…`
            : "Send to all"}
        </button>

        ${this.bulkErrorMessage
          ? html`<p class="danger" style="margin-top: 12px;">
              ${this.bulkErrorMessage}
            </p>`
          : nothing}
        ${this.bulkResult
          ? html`<div style="margin-top: 12px;">
              <p
                class=${this.bulkResult.failedCount === 0
                  ? "success"
                  : "danger"}
              >
                Sent ${this.bulkResult.sentCount}, failed
                ${this.bulkResult.failedCount}.
              </p>
              ${this.bulkResult.errors.length > 0
                ? html`<ul class="eaw-errors">
                    ${this.bulkResult.errors.map(
                      (err) =>
                        html`<li class="danger" style="font-size: 13px;">
                          ${err.email}: ${err.error}
                        </li>`
                    )}
                  </ul>`
                : nothing}
            </div>`
          : nothing}
      </form>
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
