import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from "@angular/core";
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
  EmailLogEntry,
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
 * Reads a File's text content via FileReader — same approach as every
 * other wrapper (React/Vue/Preact/Solid/web-component), kept identical
 * so CSV parsing behaves the same across frameworks.
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
 * `<eaw-email-automation-widget>` — the Angular wrapper around the Core
 * SDK. Mirrors `@eaw/react`'s `EmailAutomationWidget` behaviour so every
 * framework wrapper stays behaviourally identical; only the rendering
 * layer differs (Angular templates here, JSX in React).
 *
 * Usage:
 *   <eaw-email-automation-widget
 *     [mode]="'mailbox'"
 *     [baseURL]="'/api'"
 *     [token]="token"
 *     (error)="onError($event)" />
 */
@Component({
  selector: "eaw-email-automation-widget",
  standalone: true,
  template: `
    <div class="eaw-root" [attr.data-layout]="layout" [style]="cssVars">
      <h2 class="eaw-title">Email Automation Widget</h2>

      @if (mode === "mailbox") { @if (loading) {
      <p>Loading mailbox…</p>
      } @if (errorMessage) {
      <p class="eaw-error">{{ errorMessage }}</p>
      } @if (!loading && !errorMessage) {
      <ul>
        @for (mail of emails; track mail.id) {
        <li>
          <strong>{{ mail.subject }}</strong>
          <span class="eaw-muted">— {{ mail.from }}</span>
        </li>
        } @empty {
        <li>No messages yet.</li>
        }
      </ul>
      } } @if (mode === "dashboard") {
      <p class="eaw-muted">Dashboard content coming in a later milestone.</p>
      } @if (mode === "composer") {
      <form (submit)="handleComposeSubmit($event)" novalidate>
        <label class="eaw-label" for="eaw-compose-to">To</label>
        <input
          id="eaw-compose-to"
          class="eaw-input"
          type="text"
          placeholder="recipient@example.com"
          [value]="composeForm.to"
          (input)="updateComposeField('to', $any($event.target).value)"
        />
        @if (composeErrors.to) {
        <p class="eaw-field-error">{{ composeErrors.to }}</p>
        }

        <label class="eaw-label" for="eaw-compose-cc">CC</label>
        <input
          id="eaw-compose-cc"
          class="eaw-input"
          type="text"
          placeholder="cc1@example.com, cc2@example.com"
          [value]="composeForm.cc"
          (input)="updateComposeField('cc', $any($event.target).value)"
        />

        <label class="eaw-label" for="eaw-compose-bcc">BCC</label>
        <input
          id="eaw-compose-bcc"
          class="eaw-input"
          type="text"
          placeholder="bcc1@example.com"
          [value]="composeForm.bcc"
          (input)="updateComposeField('bcc', $any($event.target).value)"
        />

        <label class="eaw-label" for="eaw-compose-subject">Subject</label>
        <input
          id="eaw-compose-subject"
          class="eaw-input"
          type="text"
          [value]="composeForm.subject"
          (input)="updateComposeField('subject', $any($event.target).value)"
        />
        @if (composeErrors.subject) {
        <p class="eaw-field-error">{{ composeErrors.subject }}</p>
        }

        <label class="eaw-label" for="eaw-compose-body">Message</label>
        <textarea
          id="eaw-compose-body"
          class="eaw-input eaw-body"
          [value]="composeForm.body"
          (input)="updateComposeField('body', $any($event.target).value)"
        ></textarea>
        @if (composeErrors.body) {
        <p class="eaw-field-error">{{ composeErrors.body }}</p>
        }

        <button class="eaw-submit" type="submit" [disabled]="sending">
          {{ sending ? "Sending…" : "Send" }}
        </button>

        @if (sendResultMessage) {
        <p
          class="eaw-send-result"
          [class.eaw-success]="sendResultMessage.startsWith('Sent to')"
          [class.eaw-error]="!sendResultMessage.startsWith('Sent to')"
        >
          {{ sendResultMessage }}
        </p>
        }
      </form>
      } @if (mode === "bulk") {
      <form (submit)="handleBulkSubmit($event)" novalidate>
        <div class="eaw-tabs" role="tablist" aria-label="Recipient source">
          <button
            type="button"
            role="tab"
            class="eaw-tab"
            [attr.aria-selected]="bulkRecipientSource === 'paste'"
            (click)="switchBulkRecipientSource('paste')"
          >
            Paste list
          </button>
          <button
            type="button"
            role="tab"
            class="eaw-tab"
            [attr.aria-selected]="bulkRecipientSource === 'csv'"
            (click)="switchBulkRecipientSource('csv')"
          >
            Upload CSV
          </button>
        </div>

        @if (bulkRecipientSource === "paste") {
        <label class="eaw-label" for="eaw-bulk-recipients">Recipients</label>
        <textarea
          id="eaw-bulk-recipients"
          class="eaw-input"
          placeholder="one@example.com, two@example.com&#10;three@example.com"
          [value]="bulkForm.recipientsRaw"
          (input)="updateBulkField('recipientsRaw', $any($event.target).value)"
        ></textarea>
        } @if (bulkRecipientSource === "csv") {
        <label class="eaw-label" for="eaw-bulk-csv">CSV file</label>
        <input
          id="eaw-bulk-csv"
          class="eaw-input"
          type="file"
          accept=".csv,text/csv"
          (change)="handleCsvFileChange($event)"
        />
        <p class="eaw-hint">
          First row must be a header row. A column named "email" (or "email
          address") is used as the recipient; every other column becomes a
          personalization placeholder, e.g.
          <code>{{ '{{name}}' }}</code>.
        </p>
        @if (csvFileName) {
        <p class="eaw-hint">
          Loaded: {{ csvFileName
          }}{{
            csvParseResult && !csvParseResult.missingEmailColumn
              ? " — columns: " + csvParseResult.headers.join(", ")
              : ""
          }}
        </p>
        } @if (csvReadError) {
        <p class="eaw-field-error">{{ csvReadError }}</p>
        } @if (csvParseResult?.missingEmailColumn) {
        <p class="eaw-field-error">
          No "email" column found{{
            (csvParseResult?.headers?.length ?? 0) > 0
              ? " — detected columns: " + csvParseResult!.headers.join(", ")
              : ""
          }}. Add an "email" (or "email address") column and re-upload.
        </p>
        } }

        <p class="eaw-hint eaw-recipient-count">
          {{ bulkRecipients.length }} valid recipient{{
            bulkRecipients.length === 1 ? "" : "s"
          }}
        </p>
        @if (bulkInvalidEntries.length > 0) {
        <p class="eaw-field-error">
          Ignoring {{ bulkInvalidEntries.length }} invalid address{{
            bulkInvalidEntries.length === 1 ? "" : "es"
          }}: {{ bulkInvalidEntries.join(", ") }}
        </p>
        } @if (bulkErrors.recipients && !csvParseResult?.missingEmailColumn) {
        <p class="eaw-field-error">{{ bulkErrors.recipients }}</p>
        }

        <label class="eaw-label" for="eaw-bulk-cc"
          >CC (applies once to the whole batch)</label
        >
        <input
          id="eaw-bulk-cc"
          class="eaw-input"
          type="text"
          placeholder="manager@example.com"
          [value]="bulkForm.cc"
          (input)="updateBulkField('cc', $any($event.target).value)"
        />

        <label class="eaw-label" for="eaw-bulk-bcc"
          >BCC (applies once to the whole batch)</label
        >
        <input
          id="eaw-bulk-bcc"
          class="eaw-input"
          type="text"
          placeholder="audit@example.com"
          [value]="bulkForm.bcc"
          (input)="updateBulkField('bcc', $any($event.target).value)"
        />

        <label class="eaw-label" for="eaw-bulk-subject">Subject</label>
        <input
          id="eaw-bulk-subject"
          class="eaw-input"
          type="text"
          [value]="bulkForm.subject"
          (input)="updateBulkField('subject', $any($event.target).value)"
        />
        @if (bulkErrors.subject) {
        <p class="eaw-field-error">{{ bulkErrors.subject }}</p>
        }

        <label class="eaw-label" for="eaw-bulk-body">Message</label>
        <textarea
          id="eaw-bulk-body"
          class="eaw-input eaw-body"
          [value]="bulkForm.body"
          (input)="updateBulkField('body', $any($event.target).value)"
        ></textarea>
        @if (bulkErrors.body) {
        <p class="eaw-field-error">{{ bulkErrors.body }}</p>
        }

        <button class="eaw-submit" type="submit" [disabled]="bulkSending">
          {{
            bulkSending && bulkProgress
              ? "Sending " +
                bulkProgress.sent +
                " of " +
                bulkProgress.total +
                "…"
              : "Send to all"
          }}
        </button>

        @if (bulkErrorMessage) {
        <p class="eaw-error eaw-send-result">{{ bulkErrorMessage }}</p>
        } @if (bulkResult) {
        <div class="eaw-bulk-result">
          <p
            [class.eaw-success]="bulkResult.failedCount === 0"
            [class.eaw-error]="bulkResult.failedCount > 0"
          >
            Sent {{ bulkResult.sentCount }}, failed
            {{ bulkResult.failedCount }}.
          </p>
          @if (bulkResult.errors.length > 0) {
          <ul class="eaw-errors">
            @for (err of bulkResult.errors; track err.email) {
            <li class="eaw-error">{{ err.email }}: {{ err.error }}</li>
            }
          </ul>
          }
        </div>
        }
      </form>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .eaw-root {
        padding: 20px;
        border: 1px solid var(--eaw-color-border, #e5e7eb);
        border-radius: var(--eaw-radius, 8px);
        background: var(--eaw-color-bg, #ffffff);
        color: var(--eaw-color-text-primary, #111827);
        font-family: var(--eaw-font-family, sans-serif);
      }
      .eaw-title {
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
      .eaw-muted {
        color: var(--eaw-color-text-secondary, #6b7280);
      }
      .eaw-error {
        color: var(--eaw-color-danger, #dc2626);
      }
      .eaw-success {
        color: var(--eaw-color-success, #16a34a);
      }
      .eaw-label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--eaw-color-text-secondary, #6b7280);
      }
      .eaw-input {
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
      input[type="file"].eaw-input {
        padding: 6px 0;
      }
      textarea.eaw-input {
        min-height: 100px;
        resize: vertical;
      }
      textarea.eaw-body {
        min-height: 120px;
      }
      .eaw-field-error {
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
      .eaw-recipient-count {
        margin-bottom: 12px;
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
      .eaw-send-result {
        margin-top: 12px;
      }
      .eaw-bulk-result {
        margin-top: 12px;
      }
      .eaw-errors {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .eaw-errors li {
        border-bottom: none;
        padding: 2px 0;
        font-size: 13px;
      }
    `,
  ],
})
export class EmailAutomationWidgetComponent implements OnInit, OnChanges {
  @Input() mode: WidgetMode = "dashboard";
  @Input() layout: "full" | "embedded" = "full";
  @Input() theme?: Partial<WidgetTheme>;
  @Input() baseURL = "/api";
  @Input() token?: string;
  @Input() adapter?: Partial<EmailAdapter>;

  @Output() error = new EventEmitter<Error>();
  @Output() emailSent = new EventEmitter<EmailLogEntry>();
  @Output() bulkSent = new EventEmitter<BulkSendResult>();

  loading = false;
  emails: MailboxItem[] = [];
  errorMessage: string | null = null;

  // --- Composer state --------------------------------------------------
  composeForm: ComposeFormState = emptyComposeForm();
  composeErrors: ComposeValidationErrors = {};
  composeTouched = false;
  sending = false;
  sendResultMessage: string | null = null;

  // --- Bulk composer state ----------------------------------------------
  bulkForm: BulkComposeFormState = emptyBulkComposeForm();
  bulkErrors: BulkComposeValidationErrors = {};
  bulkTouched = false;
  bulkSending = false;
  bulkProgress: { sent: number; total: number } | null = null;
  bulkResult: BulkSendResult | null = null;
  bulkErrorMessage: string | null = null;
  bulkRecipientSource: BulkRecipientSource = "paste";
  csvFileName: string | null = null;
  csvParseResult: CsvRecipientParseResult | null = null;
  csvReadError: string | null = null;

  private _adapter!: EmailAdapter;

  get cssVars(): Record<string, string> {
    return themeToCssVars(resolveTheme(this.theme));
  }

  private get pasteParsed() {
    return parseRecipients(this.bulkForm.recipientsRaw);
  }

  get bulkRecipients(): BulkRecipient[] {
    return this.bulkRecipientSource === "csv"
      ? this.csvParseResult?.recipients ?? EMPTY_RECIPIENTS
      : this.pasteParsed.recipients;
  }

  get bulkInvalidEntries(): string[] {
    return this.bulkRecipientSource === "csv"
      ? this.csvParseResult?.invalidEntries ?? EMPTY_INVALID_ENTRIES
      : this.pasteParsed.invalidEntries;
  }

  ngOnInit(): void {
    this.initAdapter();
    if (this.mode === "mailbox") {
      this.loadMailbox();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["baseURL"] || changes["token"] || changes["adapter"]) {
      this.initAdapter();
    }
    if (this.mode === "mailbox") {
      this.loadMailbox();
    }
  }

  private initAdapter(): void {
    const client = new ApiClient(
      this.baseURL,
      this.token ? { type: "Bearer", token: this.token } : undefined
    );
    this._adapter = createDefaultAdapter(client);
  }

  private loadMailbox(): void {
    if (!this._adapter) {
      this.initAdapter();
    }
    this.loading = true;
    this.errorMessage = null;
    this._adapter
      .mailbox()
      .then((result) => {
        this.emails = result.items;
      })
      .catch((err: Error) => {
        this.errorMessage = err.message;
        this.error.emit(err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  // --- Composer handlers -------------------------------------------------

  updateComposeField(field: keyof ComposeFormState, value: string): void {
    this.composeTouched = true;
    this.sendResultMessage = null;
    this.composeForm = { ...this.composeForm, [field]: value };
    if (this.composeTouched) {
      this.composeErrors = validateComposeForm(this.composeForm);
    }
  }

  async handleComposeSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.composeTouched = true;
    const errors = validateComposeForm(this.composeForm);
    this.composeErrors = errors;
    if (!isComposeFormValid(errors)) return;

    if (!this._adapter) this.initAdapter();
    this.sending = true;
    this.sendResultMessage = null;
    try {
      const entry = await submitComposeForm(this._adapter, this.composeForm);
      this.emailSent.emit(entry);
      this.sendResultMessage = `Sent to ${entry.to}.`;
      this.composeForm = emptyComposeForm();
      this.composeTouched = false;
      this.composeErrors = {};
    } catch (err) {
      const e2 = err instanceof Error ? err : new Error("Failed to send email");
      this.sendResultMessage = e2.message;
      this.error.emit(e2);
    } finally {
      this.sending = false;
    }
  }

  // --- Bulk composer handlers ---------------------------------------------

  updateBulkField(field: keyof BulkComposeFormState, value: string): void {
    this.bulkTouched = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.bulkForm = { ...this.bulkForm, [field]: value };
    this.refreshBulkErrors();
  }

  switchBulkRecipientSource(source: BulkRecipientSource): void {
    this.bulkRecipientSource = source;
    this.bulkTouched = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.refreshBulkErrors();
  }

  private refreshBulkErrors(): void {
    if (!this.bulkTouched) return;
    this.bulkErrors = validateBulkComposeForm(
      this.bulkForm,
      this.bulkRecipients
    );
  }

  async handleCsvFileChange(e: Event): Promise<void> {
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

  async handleBulkSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.bulkTouched = true;
    const errors = validateBulkComposeForm(this.bulkForm, this.bulkRecipients);
    this.bulkErrors = errors;
    if (!isBulkComposeFormValid(errors)) return;

    if (!this._adapter) this.initAdapter();
    this.bulkSending = true;
    this.bulkResult = null;
    this.bulkErrorMessage = null;
    this.bulkProgress = { sent: 0, total: this.bulkRecipients.length };
    try {
      const result = await submitBulkComposeForm(
        this._adapter,
        this.bulkForm,
        this.bulkRecipients,
        (sent, total) => {
          this.bulkProgress = { sent, total };
        }
      );
      this.bulkSent.emit(result);
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
      this.error.emit(e2);
    } finally {
      this.bulkSending = false;
    }
  }
}
