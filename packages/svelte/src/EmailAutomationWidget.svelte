<script lang="ts">
  import {
    ApiClient,
    createDefaultAdapter,
    resolveTheme,
    themeToCssVars,
    emptyComposeForm,
    validateComposeForm,
    isComposeFormValid,
    submitComposeForm,
    emptyBulkComposeForm,
    parseRecipients,
    parseRecipientsFromCsv,
    validateBulkComposeForm,
    isBulkComposeFormValid,
    submitBulkComposeForm,
    type MailboxItem,
    type WidgetMode,
    type WidgetTheme,
    type ComposeFormState,
    type ComposeValidationErrors,
    type EmailLogEntry,
    type BulkComposeFormState,
    type BulkComposeValidationErrors,
    type BulkSendResult,
    type BulkRecipient,
    type CsvRecipientParseResult,
  } from "@eaw/core";

  /**
   * `<EmailAutomationWidget>` — the Svelte 5 wrapper around the Core SDK.
   * Mirrors `@eaw/react`, `@eaw/vue`, and `@eaw/angular` behaviour
   * exactly; only the rendering layer (Svelte template + runes) differs.
   */
  interface Props {
    mode?: WidgetMode;
    layout?: "full" | "embedded";
    theme?: Partial<WidgetTheme>;
    baseURL?: string;
    token?: string;
    onError?: (error: Error) => void;
    onEmailSent?: (entry: EmailLogEntry) => void;
    onBulkSent?: (result: BulkSendResult) => void;
  }

  let {
    mode = "dashboard",
    layout = "full",
    theme,
    baseURL = "/api",
    token,
    onError,
    onEmailSent,
    onBulkSent,
  }: Props = $props();

  type BulkRecipientSource = "paste" | "csv";

  const EMPTY_RECIPIENTS: BulkRecipient[] = [];
  const EMPTY_INVALID_ENTRIES: string[] = [];

  /**
   * Reads a File's text content via FileReader — same approach as every
   * other wrapper (React/Vue/Angular/Preact/Solid/web-component), kept
   * identical so CSV parsing behaves the same across frameworks.
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  let emails = $state<MailboxItem[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  // --- Composer state ------------------------------------------------
  let composeForm = $state<ComposeFormState>(emptyComposeForm());
  let composeErrors = $state<ComposeValidationErrors>({});
  let composeTouched = $state(false);
  let sending = $state(false);
  let sendResultMessage = $state<string | null>(null);

  // --- Bulk composer state ---------------------------------------------
  let bulkForm = $state<BulkComposeFormState>(emptyBulkComposeForm());
  let bulkErrors = $state<BulkComposeValidationErrors>({});
  let bulkTouched = $state(false);
  let bulkSending = $state(false);
  let bulkProgress = $state<{ sent: number; total: number } | null>(null);
  let bulkResult = $state<BulkSendResult | null>(null);
  let bulkErrorMessage = $state<string | null>(null);
  let bulkRecipientSource = $state<BulkRecipientSource>("paste");
  let csvFileName = $state<string | null>(null);
  let csvParseResult = $state<CsvRecipientParseResult | null>(null);
  let csvReadError = $state<string | null>(null);

  const resolvedTheme = $derived(resolveTheme(theme));
  const cssVars = $derived(themeToCssVars(resolvedTheme));
  const rootStyle = $derived(
    Object.entries(cssVars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";") +
      ";padding:20px;border:1px solid var(--eaw-color-border);border-radius:var(--eaw-radius);background:var(--eaw-color-bg);color:var(--eaw-color-text-primary);font-family:var(--eaw-font-family);"
  );

  const adapter = $derived.by(() => {
    const client = new ApiClient(baseURL, token ? { type: "Bearer", token } : undefined);
    return createDefaultAdapter(client);
  });

  const pasteParsed = $derived(parseRecipients(bulkForm.recipientsRaw));
  const bulkRecipients = $derived(
    bulkRecipientSource === "csv"
      ? csvParseResult?.recipients ?? EMPTY_RECIPIENTS
      : pasteParsed.recipients
  );
  const bulkInvalidEntries = $derived(
    bulkRecipientSource === "csv"
      ? csvParseResult?.invalidEntries ?? EMPTY_INVALID_ENTRIES
      : pasteParsed.invalidEntries
  );

  async function loadMailbox() {
    loading = true;
    errorMessage = null;
    try {
      const result = await adapter.mailbox();
      emails = result.items;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load mailbox";
      errorMessage = message;
      onError?.(err instanceof Error ? err : new Error(message));
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (mode === "mailbox") {
      void loadMailbox();
    }
  });

  // --- Composer handlers -----------------------------------------------

  function updateComposeField(field: keyof ComposeFormState, value: string) {
    composeTouched = true;
    sendResultMessage = null;
    composeForm = { ...composeForm, [field]: value };
    if (composeTouched) {
      composeErrors = validateComposeForm(composeForm);
    }
  }

  function textInputValue(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function textAreaValue(e: Event): string {
    return (e.currentTarget as HTMLTextAreaElement).value;
  }

  function handleComposeToInput(e: Event) {
    updateComposeField("to", textInputValue(e));
  }
  function handleComposeCcInput(e: Event) {
    updateComposeField("cc", textInputValue(e));
  }
  function handleComposeBccInput(e: Event) {
    updateComposeField("bcc", textInputValue(e));
  }
  function handleComposeSubjectInput(e: Event) {
    updateComposeField("subject", textInputValue(e));
  }
  function handleComposeBodyInput(e: Event) {
    updateComposeField("body", textAreaValue(e));
  }
  function handleBulkRecipientsInput(e: Event) {
    updateBulkField("recipientsRaw", textAreaValue(e));
  }
  function handleBulkCcInput(e: Event) {
    updateBulkField("cc", textInputValue(e));
  }
  function handleBulkBccInput(e: Event) {
    updateBulkField("bcc", textInputValue(e));
  }
  function handleBulkSubjectInput(e: Event) {
    updateBulkField("subject", textInputValue(e));
  }
  function handleBulkBodyInput(e: Event) {
    updateBulkField("body", textAreaValue(e));
  }

  async function handleComposeSubmit(e: SubmitEvent) {
    e.preventDefault();
    composeTouched = true;
    const errors = validateComposeForm(composeForm);
    composeErrors = errors;
    if (!isComposeFormValid(errors)) return;

    sending = true;
    sendResultMessage = null;
    try {
      const entry = await submitComposeForm(adapter, composeForm);
      onEmailSent?.(entry);
      sendResultMessage = `Sent to ${entry.to}.`;
      composeForm = emptyComposeForm();
      composeTouched = false;
      composeErrors = {};
    } catch (err) {
      const e2 = err instanceof Error ? err : new Error("Failed to send email");
      sendResultMessage = e2.message;
      onError?.(e2);
    } finally {
      sending = false;
    }
  }

  // --- Bulk composer handlers -------------------------------------------

  function updateBulkField(field: keyof BulkComposeFormState, value: string) {
    bulkTouched = true;
    bulkResult = null;
    bulkErrorMessage = null;
    bulkForm = { ...bulkForm, [field]: value };
    refreshBulkErrors();
  }

  function switchBulkRecipientSource(source: BulkRecipientSource) {
    bulkRecipientSource = source;
    bulkTouched = true;
    bulkResult = null;
    bulkErrorMessage = null;
    refreshBulkErrors();
  }

  function refreshBulkErrors() {
    if (!bulkTouched) return;
    bulkErrors = validateBulkComposeForm(bulkForm, bulkRecipients);
  }

  async function handleCsvFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    bulkTouched = true;
    bulkResult = null;
    bulkErrorMessage = null;

    if (!file) {
      csvFileName = null;
      csvParseResult = null;
      csvReadError = null;
      refreshBulkErrors();
      return;
    }

    csvFileName = file.name;
    try {
      const text = await readFileAsText(file);
      csvReadError = null;
      csvParseResult = parseRecipientsFromCsv(text);
    } catch {
      csvReadError = "Could not read that file. Please upload a CSV file.";
      csvParseResult = null;
    }
    refreshBulkErrors();
  }

  async function handleBulkSubmit(e: SubmitEvent) {
    e.preventDefault();
    bulkTouched = true;
    const errors = validateBulkComposeForm(bulkForm, bulkRecipients);
    bulkErrors = errors;
    if (!isBulkComposeFormValid(errors)) return;

    bulkSending = true;
    bulkResult = null;
    bulkErrorMessage = null;
    bulkProgress = { sent: 0, total: bulkRecipients.length };
    try {
      const result = await submitBulkComposeForm(adapter, bulkForm, bulkRecipients, (sent, total) => {
        bulkProgress = { sent, total };
      });
      onBulkSent?.(result);
      bulkResult = result;
      bulkForm = emptyBulkComposeForm();
      bulkTouched = false;
      bulkErrors = {};
      csvFileName = null;
      csvParseResult = null;
      csvReadError = null;
    } catch (err) {
      const e2 = err instanceof Error ? err : new Error("Failed to send bulk email");
      bulkErrorMessage = e2.message;
      onError?.(e2);
    } finally {
      bulkSending = false;
    }
  }
</script>

<div class="eaw-root" data-layout={layout} style={rootStyle}>
  <h2 style="margin:0 0 12px;font-size:18px;">Email Automation Widget</h2>

  {#if mode === "mailbox"}
    {#if loading}
      <p>Loading mailbox…</p>
    {:else if errorMessage}
      <p style="color:var(--eaw-color-danger);">{errorMessage}</p>
    {:else}
      <ul style="list-style:none;margin:0;padding:0;">
        {#each emails as mail (mail.id)}
          <li style="padding:8px 0;border-bottom:1px solid var(--eaw-color-border);">
            <strong>{mail.subject}</strong>
            <span style="color:var(--eaw-color-text-secondary);"> — {mail.from}</span>
          </li>
        {:else}
          <li>No messages yet.</li>
        {/each}
      </ul>
    {/if}
  {:else if mode === "dashboard"}
    <p style="color:var(--eaw-color-text-secondary);">Dashboard content coming in a later milestone.</p>
  {:else if mode === "composer"}
    <form onsubmit={handleComposeSubmit} novalidate>
      <label class="eaw-label" for="eaw-compose-to">To</label>
      <input
        id="eaw-compose-to"
        class="eaw-input"
        type="text"
        placeholder="recipient@example.com"
        value={composeForm.to}
        oninput={handleComposeToInput}
      />
      {#if composeErrors.to}
        <p class="eaw-field-error">{composeErrors.to}</p>
      {/if}

      <label class="eaw-label" for="eaw-compose-cc">CC</label>
      <input
        id="eaw-compose-cc"
        class="eaw-input"
        type="text"
        placeholder="cc1@example.com, cc2@example.com"
        value={composeForm.cc}
        oninput={handleComposeCcInput}
      />

      <label class="eaw-label" for="eaw-compose-bcc">BCC</label>
      <input
        id="eaw-compose-bcc"
        class="eaw-input"
        type="text"
        placeholder="bcc1@example.com"
        value={composeForm.bcc}
        oninput={handleComposeBccInput}
      />

      <label class="eaw-label" for="eaw-compose-subject">Subject</label>
      <input
        id="eaw-compose-subject"
        class="eaw-input"
        type="text"
        value={composeForm.subject}
        oninput={handleComposeSubjectInput}
      />
      {#if composeErrors.subject}
        <p class="eaw-field-error">{composeErrors.subject}</p>
      {/if}

      <label class="eaw-label" for="eaw-compose-body">Message</label>
      <textarea
        id="eaw-compose-body"
        class="eaw-input eaw-body"
        value={composeForm.body}
        oninput={handleComposeBodyInput}
      ></textarea>
      {#if composeErrors.body}
        <p class="eaw-field-error">{composeErrors.body}</p>
      {/if}

      <button class="eaw-submit" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send"}
      </button>

      {#if sendResultMessage}
        <p
          class="eaw-send-result"
          style={`color:${sendResultMessage.startsWith("Sent to") ? "var(--eaw-color-success, #16a34a)" : "var(--eaw-color-danger)"};`}
        >
          {sendResultMessage}
        </p>
      {/if}
    </form>
  {:else if mode === "bulk"}
    <form onsubmit={handleBulkSubmit} novalidate>
      <div class="eaw-tabs" role="tablist" aria-label="Recipient source">
        <button
          type="button"
          role="tab"
          class="eaw-tab"
          aria-selected={bulkRecipientSource === "paste"}
          onclick={() => switchBulkRecipientSource("paste")}
        >
          Paste list
        </button>
        <button
          type="button"
          role="tab"
          class="eaw-tab"
          aria-selected={bulkRecipientSource === "csv"}
          onclick={() => switchBulkRecipientSource("csv")}
        >
          Upload CSV
        </button>
      </div>

      {#if bulkRecipientSource === "paste"}
        <label class="eaw-label" for="eaw-bulk-recipients">Recipients</label>
        <textarea
          id="eaw-bulk-recipients"
          class="eaw-input"
          placeholder={"one@example.com, two@example.com\nthree@example.com"}
          value={bulkForm.recipientsRaw}
          oninput={handleBulkRecipientsInput}
        ></textarea>
      {/if}

      {#if bulkRecipientSource === "csv"}
        <label class="eaw-label" for="eaw-bulk-csv">CSV file</label>
        <input
          id="eaw-bulk-csv"
          class="eaw-input"
          type="file"
          accept=".csv,text/csv"
          onchange={handleCsvFileChange}
        />
        <p class="eaw-hint">
          First row must be a header row. A column named "email" (or "email address") is used as the
          recipient; every other column becomes a personalization placeholder, e.g. <code>{"{{name}}"}</code>.
        </p>
        {#if csvFileName}
          <p class="eaw-hint">
            Loaded: {csvFileName}{csvParseResult && !csvParseResult.missingEmailColumn
              ? ` — columns: ${csvParseResult.headers.join(", ")}`
              : ""}
          </p>
        {/if}
        {#if csvReadError}
          <p class="eaw-field-error">{csvReadError}</p>
        {/if}
        {#if csvParseResult?.missingEmailColumn}
          <p class="eaw-field-error">
            No "email" column found{csvParseResult.headers.length > 0
              ? ` — detected columns: ${csvParseResult.headers.join(", ")}`
              : ""}. Add an "email" (or "email address") column and re-upload.
          </p>
        {/if}
      {/if}

      <p class="eaw-hint eaw-recipient-count">
        {bulkRecipients.length} valid recipient{bulkRecipients.length === 1 ? "" : "s"}
      </p>
      {#if bulkInvalidEntries.length > 0}
        <p class="eaw-field-error">
          Ignoring {bulkInvalidEntries.length} invalid address{bulkInvalidEntries.length === 1 ? "" : "es"}:
          {bulkInvalidEntries.join(", ")}
        </p>
      {/if}
      {#if bulkErrors.recipients && !csvParseResult?.missingEmailColumn}
        <p class="eaw-field-error">{bulkErrors.recipients}</p>
      {/if}

      <label class="eaw-label" for="eaw-bulk-cc">CC (applies once to the whole batch)</label>
      <input
        id="eaw-bulk-cc"
        class="eaw-input"
        type="text"
        placeholder="manager@example.com"
        value={bulkForm.cc}
        oninput={handleBulkCcInput}
      />

      <label class="eaw-label" for="eaw-bulk-bcc">BCC (applies once to the whole batch)</label>
      <input
        id="eaw-bulk-bcc"
        class="eaw-input"
        type="text"
        placeholder="audit@example.com"
        value={bulkForm.bcc}
        oninput={handleBulkBccInput}
      />

      <label class="eaw-label" for="eaw-bulk-subject">Subject</label>
      <input
        id="eaw-bulk-subject"
        class="eaw-input"
        type="text"
        value={bulkForm.subject}
        oninput={handleBulkSubjectInput}
      />
      {#if bulkErrors.subject}
        <p class="eaw-field-error">{bulkErrors.subject}</p>
      {/if}

      <label class="eaw-label" for="eaw-bulk-body">Message</label>
      <textarea
        id="eaw-bulk-body"
        class="eaw-input eaw-body"
        value={bulkForm.body}
        oninput={handleBulkBodyInput}
      ></textarea>
      {#if bulkErrors.body}
        <p class="eaw-field-error">{bulkErrors.body}</p>
      {/if}

      <button class="eaw-submit" type="submit" disabled={bulkSending}>
        {bulkSending && bulkProgress ? `Sending ${bulkProgress.sent} of ${bulkProgress.total}…` : "Send to all"}
      </button>

      {#if bulkErrorMessage}
        <p class="eaw-send-result" style="color:var(--eaw-color-danger);">{bulkErrorMessage}</p>
      {/if}
      {#if bulkResult}
        <div class="eaw-bulk-result">
          <p
            style={`color:${bulkResult.failedCount === 0 ? "var(--eaw-color-success, #16a34a)" : "var(--eaw-color-danger)"};`}
          >
            Sent {bulkResult.sentCount}, failed {bulkResult.failedCount}.
          </p>
          {#if bulkResult.errors.length > 0}
            <ul class="eaw-errors">
              {#each bulkResult.errors as err (err.email)}
                <li style="color:var(--eaw-color-danger);font-size:13px;">{err.email}: {err.error}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
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
</style>