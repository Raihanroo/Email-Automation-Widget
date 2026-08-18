import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  MailboxItem,
  WidgetProps,
  emptyComposeForm,
  validateComposeForm,
  isComposeFormValid,
  submitComposeForm,
  ComposeFormState,
  emptyBulkComposeForm,
  parseRecipients,
  parseRecipientsFromCsv,
  validateBulkComposeForm,
  isBulkComposeFormValid,
  submitBulkComposeForm,
  BulkComposeFormState,
  BulkSendResult,
  CsvRecipientParseResult,
} from "@eaw/core";

type BulkRecipientSource = "paste" | "csv";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function EmailAutomationWidget(props: WidgetProps) {
  const {
    mode = "dashboard",
    layout = "full",
    theme: themeOverride,
    baseURL = "/api",
    token,
    onError,
    onEmailSent,
    onBulkSent,
  } = props;

  // Mailbox state
  const [emails, setEmails] = createSignal<MailboxItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Compose state
  const [composeForm, setComposeForm] = createSignal<ComposeFormState>(
    emptyComposeForm()
  );
  const [composeErrors, setComposeErrors] = createSignal<
    ReturnType<typeof validateComposeForm>
  >({});
  const [composeTouched, setComposeTouched] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [sendResultMessage, setSendResultMessage] = createSignal<string | null>(
    null
  );

  // Bulk state
  const [bulkForm, setBulkForm] = createSignal<BulkComposeFormState>(
    emptyBulkComposeForm()
  );
  const [bulkTouched, setBulkTouched] = createSignal(false);
  const [bulkSending, setBulkSending] = createSignal(false);
  const [bulkProgress, setBulkProgress] = createSignal<{
    sent: number;
    total: number;
  } | null>(null);
  const [bulkResult, setBulkResult] = createSignal<BulkSendResult | null>(null);
  const [bulkErrorMessage, setBulkErrorMessage] = createSignal<string | null>(
    null
  );
  const [bulkErrors, setBulkErrors] = createSignal<
    ReturnType<typeof validateBulkComposeForm>
  >({});

  const [bulkRecipientSource, setBulkRecipientSource] =
    createSignal<BulkRecipientSource>("paste");
  const [csvFileName, setCsvFileName] = createSignal<string | null>(null);
  const [csvParseResult, setCsvParseResult] =
    createSignal<CsvRecipientParseResult | null>(null);
  const [csvReadError, setCsvReadError] = createSignal<string | null>(null);

  const pasteParsed = createMemo(() =>
    parseRecipients(bulkForm().recipientsRaw)
  );

  const bulkRecipients = createMemo(() =>
    bulkRecipientSource() === "csv"
      ? csvParseResult()?.recipients ?? []
      : pasteParsed().recipients
  );
  const bulkInvalidEntries = createMemo(() =>
    bulkRecipientSource() === "csv"
      ? csvParseResult()?.invalidEntries ?? []
      : pasteParsed().invalidEntries
  );

  const theme = createMemo(() => resolveTheme(themeOverride));
  const cssVars = createMemo(() => themeToCssVars(theme()));

  const adapter = createMemo(() => {
    const client = new ApiClient(
      baseURL,
      token ? { type: "Bearer", token } : undefined
    );
    return createDefaultAdapter(client);
  });

  // Load mailbox effect
  createEffect(() => {
    if (mode !== "mailbox") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    adapter()
      .mailbox()
      .then((result) => {
        if (!cancelled) setEmails(result.items);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        onError?.(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    onCleanup(() => {
      cancelled = true;
    });
  });

  // Validation effects
  createEffect(() => {
    if (!composeTouched()) return;
    setComposeErrors(validateComposeForm(composeForm()));
  });

  createEffect(() => {
    if (!bulkTouched()) return;
    setBulkErrors(validateBulkComposeForm(bulkForm(), bulkRecipients()));
  });

  function updateComposeField(field: keyof ComposeFormState, value: string) {
    setComposeTouched(true);
    setSendResultMessage(null);
    setComposeForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateBulkField(field: keyof BulkComposeFormState, value: string) {
    setBulkTouched(true);
    setBulkResult(null);
    setBulkErrorMessage(null);
    setBulkForm((prev) => ({ ...prev, [field]: value }));
  }

  function switchBulkRecipientSource(source: BulkRecipientSource) {
    setBulkRecipientSource(source);
    setBulkTouched(true);
    setBulkResult(null);
    setBulkErrorMessage(null);
  }

  async function handleCsvFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    setBulkTouched(true);
    setBulkResult(null);
    setBulkErrorMessage(null);

    if (!file) {
      setCsvFileName(null);
      setCsvParseResult(null);
      setCsvReadError(null);
      return;
    }

    setCsvFileName(file.name);
    try {
      const text = await readFileAsText(file);
      setCsvReadError(null);
      setCsvParseResult(parseRecipientsFromCsv(text));
    } catch {
      setCsvReadError("Could not read that file. Please upload a CSV file.");
      setCsvParseResult(null);
    }
  }

  async function handleComposeSubmit(e: Event) {
    e.preventDefault();
    setComposeTouched(true);
    const errors = validateComposeForm(composeForm());
    setComposeErrors(errors);
    if (!isComposeFormValid(errors)) return;

    setSending(true);
    setSendResultMessage(null);
    try {
      const entry = await submitComposeForm(adapter(), composeForm());
      onEmailSent?.(entry);
      setSendResultMessage(`Sent to ${entry.to}.`);
      setComposeForm(emptyComposeForm());
      setComposeTouched(false);
      setComposeErrors({});
    } catch (err) {
      const e2 = err instanceof Error ? err : new Error("Failed to send email");
      setSendResultMessage(e2.message);
      onError?.(e2);
    } finally {
      setSending(false);
    }
  }

  async function handleBulkSubmit(e: Event) {
    e.preventDefault();
    setBulkTouched(true);
    const errors = validateBulkComposeForm(bulkForm(), bulkRecipients());
    setBulkErrors(errors);
    if (!isBulkComposeFormValid(errors)) return;

    setBulkSending(true);
    setBulkResult(null);
    setBulkErrorMessage(null);
    setBulkProgress({ sent: 0, total: bulkRecipients().length });
    try {
      const result = await submitBulkComposeForm(
        adapter(),
        bulkForm(),
        bulkRecipients(),
        (sent, total) => setBulkProgress({ sent, total })
      );
      onBulkSent?.(result);
      setBulkResult(result);
      setBulkForm(emptyBulkComposeForm());
      setBulkTouched(false);
      setBulkErrors({});
      setCsvFileName(null);
      setCsvParseResult(null);
      setCsvReadError(null);
    } catch (err) {
      const e2 =
        err instanceof Error ? err : new Error("Failed to send bulk email");
      setBulkErrorMessage(e2.message);
      onError?.(e2);
    } finally {
      setBulkSending(false);
    }
  }

  const inputStyle = {
    width: "100%",
    "box-sizing": "border-box" as const,
    padding: "8px 10px",
    "margin-top": "4px",
    "margin-bottom": "12px",
    "border-radius": "var(--eaw-radius)",
    border: "1px solid var(--eaw-color-border)",
    background: "var(--eaw-color-bg)",
    color: "var(--eaw-color-text-primary)",
    "font-family": "var(--eaw-font-family)",
    "font-size": "14px",
  };

  const labelStyle = {
    "font-size": "13px",
    "font-weight": 600 as const,
    color: "var(--eaw-color-text-secondary)",
  };

  const fieldErrorStyle = {
    color: "var(--eaw-color-danger)",
    "font-size": "12px",
    "margin-top": "-8px",
    "margin-bottom": "12px",
  };

  const rootStyle = createMemo(
    () =>
      ({
        ...cssVars(),
        padding: "20px",
        border: "1px solid var(--eaw-color-border)",
        "border-radius": "var(--eaw-radius)",
        background: "var(--eaw-color-bg)",
        color: "var(--eaw-color-text-primary)",
        "font-family": "var(--eaw-font-family)",
      } as any)
  );

  return (
    <div class="eaw-root" data-layout={layout} style={rootStyle()}>
      {mode === "dashboard" && (
        <>
          <h2 style={{ margin: "0 0 12px", "font-size": "18px" }}>
            Email Automation Widget
          </h2>
          <p>Dashboard content coming in a later milestone.</p>
        </>
      )}
      {mode === "composer" && (
        <form novalidate onSubmit={handleComposeSubmit}>
          <label style={labelStyle} for="eaw-compose-to">
            To
          </label>
          <input
            id="eaw-compose-to"
            style={inputStyle}
            type="text"
            value={composeForm().to}
            placeholder="recipient@example.com"
            onInput={(e) =>
              updateComposeField("to", (e.target as HTMLInputElement).value)
            }
          />
          {composeErrors().to && (
            <p style={fieldErrorStyle}>{composeErrors().to}</p>
          )}

          <label style={labelStyle} for="eaw-compose-cc">
            CC
          </label>
          <input
            id="eaw-compose-cc"
            style={inputStyle}
            type="text"
            value={composeForm().cc}
            placeholder="cc1@example.com, cc2@example.com"
            onInput={(e) =>
              updateComposeField("cc", (e.target as HTMLInputElement).value)
            }
          />

          <label style={labelStyle} for="eaw-compose-bcc">
            BCC
          </label>
          <input
            id="eaw-compose-bcc"
            style={inputStyle}
            type="text"
            value={composeForm().bcc}
            placeholder="bcc1@example.com"
            onInput={(e) =>
              updateComposeField("bcc", (e.target as HTMLInputElement).value)
            }
          />

          <label style={labelStyle} for="eaw-compose-subject">
            Subject
          </label>
          <input
            id="eaw-compose-subject"
            style={inputStyle}
            type="text"
            value={composeForm().subject}
            placeholder="Compose a subject"
            onInput={(e) =>
              updateComposeField(
                "subject",
                (e.target as HTMLInputElement).value
              )
            }
          />
          {composeErrors().subject && (
            <p style={fieldErrorStyle}>{composeErrors().subject}</p>
          )}

          <label style={labelStyle} for="eaw-compose-body">
            Message
          </label>
          <textarea
            id="eaw-compose-body"
            style={{ ...inputStyle, "min-height": "120px", resize: "vertical" }}
            value={composeForm().body}
            placeholder="Compose your message"
            onInput={(e) =>
              updateComposeField(
                "body",
                (e.target as HTMLTextAreaElement).value
              )
            }
          />
          {composeErrors().body && (
            <p style={fieldErrorStyle}>{composeErrors().body}</p>
          )}

          {sendResultMessage() && (
            <p
              style={{
                "margin-top": "12px",
                color: sendResultMessage()?.startsWith("Sent to")
                  ? "var(--eaw-color-success, #16a34a)"
                  : "var(--eaw-color-danger)",
              }}
            >
              {sendResultMessage()}
            </p>
          )}

          <button
            type="submit"
            disabled={sending()}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              "font-family": "var(--eaw-font-family)",
              "font-size": "14px",
              cursor: sending() ? "not-allowed" : "pointer",
              opacity: sending() ? 0.7 : 1,
            }}
          >
            {sending() ? "Sending…" : "Send"}
          </button>
        </form>
      )}
      {mode === "mailbox" && (
        <div>
          {loading() && <p>Loading mailbox…</p>}
          {error() && (
            <p style={{ color: "var(--eaw-color-danger)" }}>Error: {error()}</p>
          )}
          {!loading() && !error() && emails().length === 0 && (
            <p>No messages yet.</p>
          )}
          {emails().length > 0 && (
            <ul
              style={{
                "list-style": "none",
                margin: 0,
                padding: 0,
              }}
            >
              {emails().map((mail) => (
                <li
                  style={{
                    padding: "8px 0",
                    "border-bottom": "1px solid var(--eaw-color-border)",
                  }}
                >
                  <strong>{mail.subject}</strong>
                  <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                    {" "}
                    — {mail.from}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mode === "bulk" && (
        <form novalidate onSubmit={handleBulkSubmit}>
          <div style={{ "margin-bottom": "12px", display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={() => switchBulkRecipientSource("paste")}
              style={{
                padding: "6px 12px",
                "border-radius": "var(--eaw-radius)",
                border: "1px solid var(--eaw-color-border)",
                background:
                  bulkRecipientSource() === "paste"
                    ? "var(--eaw-color-primary)"
                    : "var(--eaw-color-bg)",
                color:
                  bulkRecipientSource() === "paste"
                    ? "#fff"
                    : "var(--eaw-color-text-primary)",
                "font-family": "var(--eaw-font-family)",
                "font-size": "13px",
                cursor: "pointer",
              }}
            >
              Paste list
            </button>
            <button
              type="button"
              onClick={() => switchBulkRecipientSource("csv")}
              style={{
                padding: "6px 12px",
                "border-radius": "var(--eaw-radius)",
                border: "1px solid var(--eaw-color-border)",
                background:
                  bulkRecipientSource() === "csv"
                    ? "var(--eaw-color-primary)"
                    : "var(--eaw-color-bg)",
                color:
                  bulkRecipientSource() === "csv"
                    ? "#fff"
                    : "var(--eaw-color-text-primary)",
                "font-family": "var(--eaw-font-family)",
                "font-size": "13px",
                cursor: "pointer",
              }}
            >
              Upload CSV
            </button>
          </div>

          {bulkRecipientSource() === "paste" ? (
            <>
              <label style={labelStyle} for="eaw-bulk-recipients">
                Recipients
              </label>
              <textarea
                id="eaw-bulk-recipients"
                style={{
                  ...inputStyle,
                  "min-height": "100px",
                  resize: "vertical",
                }}
                value={bulkForm().recipientsRaw}
                placeholder="one@example.com, two@example.com&#10;three@example.com"
                onInput={(e) =>
                  updateBulkField(
                    "recipientsRaw",
                    (e.target as HTMLTextAreaElement).value
                  )
                }
              />
              <p
                style={{
                  margin: "-8px 0 12px",
                  "font-size": "12px",
                  color: "var(--eaw-color-text-secondary)",
                }}
              >
                {bulkRecipients().length} valid recipient
                {bulkRecipients().length === 1 ? "" : "s"}
              </p>
              {bulkInvalidEntries().length > 0 && (
                <p style={fieldErrorStyle}>
                  Ignoring {bulkInvalidEntries().length} invalid address
                  {bulkInvalidEntries().length === 1 ? "" : "es"}:{" "}
                  {bulkInvalidEntries().join(", ")}
                </p>
              )}
              {bulkErrors().recipients && (
                <p style={fieldErrorStyle}>{bulkErrors().recipients}</p>
              )}
            </>
          ) : (
            <>
              <label style={labelStyle} for="eaw-bulk-csv">
                CSV file
              </label>
              <input
                id="eaw-bulk-csv"
                style={{ ...inputStyle, padding: "6px 0" }}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
              />
              <p
                style={{
                  margin: "4px 0",
                  "font-size": "12px",
                  color: "var(--eaw-color-text-secondary)",
                }}
              >
                First row must be a header row. A column named "email" (or
                "email address") is used as the recipient.
              </p>
              {csvFileName() && (
                <p
                  style={{
                    margin: "4px 0",
                    "font-size": "12px",
                    color: "var(--eaw-color-text-secondary)",
                  }}
                >
                  Loaded: {csvFileName()}
                  {csvParseResult() &&
                    !csvParseResult()?.missingEmailColumn &&
                    ` — columns: ${csvParseResult()?.headers.join(", ")}`}
                </p>
              )}
              {csvReadError() && (
                <p style={fieldErrorStyle}>{csvReadError()}</p>
              )}
              {csvParseResult()?.missingEmailColumn && (
                <p style={fieldErrorStyle}>
                  No "email" column found
                  {csvParseResult()!.headers.length > 0
                    ? ` — detected columns: ${csvParseResult()!.headers.join(
                        ", "
                      )}`
                    : ""}
                  .
                </p>
              )}
            </>
          )}

          <label style={labelStyle} for="eaw-bulk-cc">
            CC (applies once to the whole batch)
          </label>
          <input
            id="eaw-bulk-cc"
            style={inputStyle}
            type="text"
            value={bulkForm().cc}
            placeholder="manager@example.com"
            onInput={(e) =>
              updateBulkField("cc", (e.target as HTMLInputElement).value)
            }
          />

          <label style={labelStyle} for="eaw-bulk-bcc">
            BCC (applies once to the whole batch)
          </label>
          <input
            id="eaw-bulk-bcc"
            style={inputStyle}
            type="text"
            value={bulkForm().bcc}
            placeholder="audit@example.com"
            onInput={(e) =>
              updateBulkField("bcc", (e.target as HTMLInputElement).value)
            }
          />

          <label style={labelStyle} for="eaw-bulk-subject">
            Subject
          </label>
          <input
            id="eaw-bulk-subject"
            style={inputStyle}
            type="text"
            value={bulkForm().subject}
            placeholder="Compose a subject"
            onInput={(e) =>
              updateBulkField("subject", (e.target as HTMLInputElement).value)
            }
          />
          {bulkErrors().subject && (
            <p style={fieldErrorStyle}>{bulkErrors().subject}</p>
          )}

          <label style={labelStyle} for="eaw-bulk-body">
            Message
          </label>
          <textarea
            id="eaw-bulk-body"
            style={{ ...inputStyle, "min-height": "120px", resize: "vertical" }}
            value={bulkForm().body}
            placeholder="Compose your message"
            onInput={(e) =>
              updateBulkField("body", (e.target as HTMLTextAreaElement).value)
            }
          />
          {bulkErrors().body && (
            <p style={fieldErrorStyle}>{bulkErrors().body}</p>
          )}

          {bulkResult() && (
            <p
              style={{
                "margin-top": "12px",
                color: "var(--eaw-color-success, #16a34a)",
              }}
            >
              Sent {bulkResult()!.sentCount}, failed {bulkResult()!.failedCount}
              .
            </p>
          )}

          {bulkErrorMessage() && (
            <p
              style={{ "margin-top": "12px", color: "var(--eaw-color-danger)" }}
            >
              {bulkErrorMessage()}
            </p>
          )}

          {bulkProgress() && (
            <p style={{ "font-size": "12px", margin: "12px 0" }}>
              Progress: {bulkProgress()!.sent} / {bulkProgress()!.total}
            </p>
          )}

          <button
            type="submit"
            disabled={bulkSending()}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              "font-family": "var(--eaw-font-family)",
              "font-size": "14px",
              cursor: bulkSending() ? "not-allowed" : "pointer",
              opacity: bulkSending() ? 0.7 : 1,
            }}
          >
            {bulkSending() ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}

export default EmailAutomationWidget;
