import { useEffect, useMemo, useState } from "preact/hooks";
import type { JSX } from "preact";
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

// Stable references so a CSV-mode render with no file loaded yet
// doesn't create a brand-new empty array on every render — that would
// break the useEffect below that depends on bulkRecipients/invalidEntries
// (new array identity every render → effect fires every render → infinite
// re-render loop).
const EMPTY_RECIPIENTS: never[] = [];
const EMPTY_INVALID_ENTRIES: never[] = [];

/**
 * Reads a File's text content via FileReader rather than the newer
 * `File.prototype.text()` — the latter isn't reliably implemented
 * across every jsdom version used in test environments, while
 * FileReader has been supported for a long time in both real browsers
 * and jsdom.
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
 * `<EmailAutomationWidget />` — the Preact wrapper around the Core SDK.
 * Mirrors `@eaw/react`'s behaviour (Preact's hooks API is a near-drop-in
 * for React's) so every framework wrapper stays behaviourally identical;
 * only the rendering layer differs.
 *
 * Usage:
 *   <EmailAutomationWidget mode="mailbox" baseURL="/api" token={token} />
 */
export function EmailAutomationWidget({
  mode = "dashboard",
  layout = "full",
  theme: themeOverride,
  baseURL = "/api",
  token,
  onError,
  onEmailSent,
  onBulkSent,
}: WidgetProps): JSX.Element {
  const [emails, setEmails] = useState<MailboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composeForm, setComposeForm] = useState<ComposeFormState>(
    emptyComposeForm()
  );
  const [composeErrors, setComposeErrors] = useState<
    ReturnType<typeof validateComposeForm>
  >({});
  const [composeTouched, setComposeTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResultMessage, setSendResultMessage] = useState<string | null>(
    null
  );

  const [bulkForm, setBulkForm] = useState<BulkComposeFormState>(
    emptyBulkComposeForm()
  );
  const [bulkTouched, setBulkTouched] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    sent: number;
    total: number;
  } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSendResult | null>(null);
  const [bulkErrorMessage, setBulkErrorMessage] = useState<string | null>(null);

  // Two ways to supply recipients for a bulk send: paste a plain list,
  // or upload a CSV (which also carries personalization columns). Only
  // one is "active" at a time — switching sources doesn't try to merge
  // the two, to avoid surprising a user who pasted a list, then also
  // uploaded a CSV, into wondering which recipients actually get used.
  const [bulkRecipientSource, setBulkRecipientSource] =
    useState<BulkRecipientSource>("paste");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvParseResult, setCsvParseResult] =
    useState<CsvRecipientParseResult | null>(null);
  const [csvReadError, setCsvReadError] = useState<string | null>(null);

  // Recipients are re-parsed live from the raw textarea on every
  // keystroke (parseRecipients is cheap — just splitting/validating
  // strings), so invalid-entry warnings and the recipient count update
  // immediately instead of only at submit time.
  const pasteParsed = useMemo(
    () => parseRecipients(bulkForm.recipientsRaw),
    [bulkForm.recipientsRaw]
  );

  const bulkRecipients = useMemo(
    () =>
      bulkRecipientSource === "csv"
        ? csvParseResult?.recipients ?? EMPTY_RECIPIENTS
        : pasteParsed.recipients,
    [bulkRecipientSource, csvParseResult, pasteParsed.recipients]
  );
  const bulkInvalidEntries = useMemo(
    () =>
      bulkRecipientSource === "csv"
        ? csvParseResult?.invalidEntries ?? EMPTY_INVALID_ENTRIES
        : pasteParsed.invalidEntries,
    [bulkRecipientSource, csvParseResult, pasteParsed.invalidEntries]
  );

  const [bulkErrors, setBulkErrors] = useState<
    ReturnType<typeof validateBulkComposeForm>
  >({});

  const theme = useMemo(() => resolveTheme(themeOverride), [themeOverride]);
  const cssVars = useMemo(
    () => themeToCssVars(theme) as JSX.CSSProperties,
    [theme]
  );

  const adapter = useMemo(() => {
    const client = new ApiClient(
      baseURL,
      token ? { type: "Bearer", token } : undefined
    );
    return createDefaultAdapter(client);
  }, [baseURL, token]);

  useEffect(() => {
    if (mode !== "mailbox") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    adapter
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

    return () => {
      cancelled = true;
    };
  }, [mode, adapter, onError]);

  // Re-validate live once the user has interacted with the form at
  // least once (touched), so errors clear as they're fixed instead of
  // only being computed on submit.
  useEffect(() => {
    if (!composeTouched) return;
    setComposeErrors(validateComposeForm(composeForm));
  }, [composeForm, composeTouched]);

  useEffect(() => {
    if (!bulkTouched) return;
    setBulkErrors(validateBulkComposeForm(bulkForm, bulkRecipients));
  }, [bulkForm, bulkRecipients, bulkTouched]);

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

  async function handleCsvFileChange(e: JSX.TargetedEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null;
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

  async function handleComposeSubmit(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    setComposeTouched(true);
    const errors = validateComposeForm(composeForm);
    setComposeErrors(errors);
    if (!isComposeFormValid(errors)) return;

    setSending(true);
    setSendResultMessage(null);
    try {
      const entry = await submitComposeForm(adapter, composeForm);
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

  async function handleBulkSubmit(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    setBulkTouched(true);
    const errors = validateBulkComposeForm(bulkForm, bulkRecipients);
    setBulkErrors(errors);
    if (!isBulkComposeFormValid(errors)) return;

    setBulkSending(true);
    setBulkResult(null);
    setBulkErrorMessage(null);
    setBulkProgress({ sent: 0, total: bulkRecipients.length });
    try {
      const result = await submitBulkComposeForm(
        adapter,
        bulkForm,
        bulkRecipients,
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

  const inputStyle: JSX.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    marginTop: "4px",
    marginBottom: "12px",
    borderRadius: "var(--eaw-radius)",
    border: "1px solid var(--eaw-color-border)",
    background: "var(--eaw-color-bg)",
    color: "var(--eaw-color-text-primary)",
    fontFamily: "var(--eaw-font-family)",
    fontSize: "14px",
  };
  const labelStyle: JSX.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--eaw-color-text-secondary)",
  };
  const fieldErrorStyle: JSX.CSSProperties = {
    color: "var(--eaw-color-danger)",
    fontSize: "12px",
    marginTop: "-8px",
    marginBottom: "12px",
  };

  return (
    <div
      class="eaw-root"
      data-layout={layout}
      style={{
        ...cssVars,
        padding: "20px",
        border: "1px solid var(--eaw-color-border)",
        borderRadius: "var(--eaw-radius)",
        background: "var(--eaw-color-bg)",
        color: "var(--eaw-color-text-primary)",
        fontFamily: "var(--eaw-font-family)",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: "18px" }}>
        Email Automation Widget
      </h2>

      {mode === "mailbox" && (
        <>
          {loading && <p>Loading mailbox…</p>}
          {error && <p style={{ color: "var(--eaw-color-danger)" }}>{error}</p>}
          {!loading && !error && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {emails.map((mail) => (
                <li
                  key={mail.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--eaw-color-border)",
                  }}
                >
                  <strong>{mail.subject}</strong>{" "}
                  <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                    — {mail.from}
                  </span>
                </li>
              ))}
              {emails.length === 0 && <li>No messages yet.</li>}
            </ul>
          )}
        </>
      )}

      {mode === "composer" && (
        <form onSubmit={handleComposeSubmit} noValidate>
          <label style={labelStyle} htmlFor="eaw-compose-to">
            To
          </label>
          <input
            id="eaw-compose-to"
            style={inputStyle}
            type="text"
            value={composeForm.to}
            onChange={(e) => updateComposeField("to", e.currentTarget.value)}
            placeholder="recipient@example.com"
          />
          {composeErrors.to && (
            <p style={fieldErrorStyle}>{composeErrors.to}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-compose-cc">
            CC
          </label>
          <input
            id="eaw-compose-cc"
            style={inputStyle}
            type="text"
            value={composeForm.cc}
            onChange={(e) => updateComposeField("cc", e.currentTarget.value)}
            placeholder="cc1@example.com, cc2@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-compose-bcc">
            BCC
          </label>
          <input
            id="eaw-compose-bcc"
            style={inputStyle}
            type="text"
            value={composeForm.bcc}
            onChange={(e) => updateComposeField("bcc", e.currentTarget.value)}
            placeholder="bcc1@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-compose-subject">
            Subject
          </label>
          <input
            id="eaw-compose-subject"
            style={inputStyle}
            type="text"
            value={composeForm.subject}
            onChange={(e) =>
              updateComposeField("subject", e.currentTarget.value)
            }
          />
          {composeErrors.subject && (
            <p style={fieldErrorStyle}>{composeErrors.subject}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-compose-body">
            Message
          </label>
          <textarea
            id="eaw-compose-body"
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
            value={composeForm.body}
            onChange={(e) => updateComposeField("body", e.currentTarget.value)}
          />
          {composeErrors.body && (
            <p style={fieldErrorStyle}>{composeErrors.body}</p>
          )}

          <button
            type="submit"
            disabled={sending}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              fontFamily: "var(--eaw-font-family)",
              fontSize: "14px",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? "Sending…" : "Send"}
          </button>

          {sendResultMessage && (
            <p
              style={{
                marginTop: "12px",
                color: sendResultMessage.startsWith("Sent to")
                  ? "var(--eaw-color-success, #16a34a)"
                  : "var(--eaw-color-danger)",
              }}
            >
              {sendResultMessage}
            </p>
          )}
        </form>
      )}

      {mode === "dashboard" && (
        <p style={{ color: "var(--eaw-color-text-secondary)" }}>
          Dashboard content coming in a later milestone.
        </p>
      )}

      {mode === "bulk" && (
        <form onSubmit={handleBulkSubmit} noValidate>
          <div
            role="tablist"
            aria-label="Recipient source"
            style={{ display: "flex", gap: "4px", marginBottom: "10px" }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={bulkRecipientSource === "paste"}
              onClick={() => switchBulkRecipientSource("paste")}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--eaw-radius)",
                border: "1px solid var(--eaw-color-border)",
                background:
                  bulkRecipientSource === "paste"
                    ? "var(--eaw-color-primary)"
                    : "var(--eaw-color-bg)",
                color:
                  bulkRecipientSource === "paste"
                    ? "#fff"
                    : "var(--eaw-color-text-primary)",
                fontFamily: "var(--eaw-font-family)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Paste list
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bulkRecipientSource === "csv"}
              onClick={() => switchBulkRecipientSource("csv")}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--eaw-radius)",
                border: "1px solid var(--eaw-color-border)",
                background:
                  bulkRecipientSource === "csv"
                    ? "var(--eaw-color-primary)"
                    : "var(--eaw-color-bg)",
                color:
                  bulkRecipientSource === "csv"
                    ? "#fff"
                    : "var(--eaw-color-text-primary)",
                fontFamily: "var(--eaw-font-family)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Upload CSV
            </button>
          </div>

          {bulkRecipientSource === "paste" && (
            <>
              <label style={labelStyle} htmlFor="eaw-bulk-recipients">
                Recipients
              </label>
              <textarea
                id="eaw-bulk-recipients"
                style={{
                  ...inputStyle,
                  minHeight: "100px",
                  resize: "vertical",
                }}
                value={bulkForm.recipientsRaw}
                onChange={(e) =>
                  updateBulkField("recipientsRaw", e.currentTarget.value)
                }
                placeholder={
                  "one@example.com, two@example.com\nthree@example.com"
                }
              />
            </>
          )}

          {bulkRecipientSource === "csv" && (
            <>
              <label style={labelStyle} htmlFor="eaw-bulk-csv">
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
                  margin: "-8px 0 4px",
                  fontSize: "12px",
                  color: "var(--eaw-color-text-secondary)",
                }}
              >
                First row must be a header row. A column named "email" (or
                "email address") is used as the recipient; every other column
                becomes a personalization placeholder, e.g.{" "}
                <code>{"{{name}}"}</code>.
              </p>
              {csvFileName && (
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: "12px",
                    color: "var(--eaw-color-text-secondary)",
                  }}
                >
                  Loaded: {csvFileName}
                  {csvParseResult &&
                    !csvParseResult.missingEmailColumn &&
                    ` — columns: ${csvParseResult.headers.join(", ")}`}
                </p>
              )}
              {csvReadError && <p style={fieldErrorStyle}>{csvReadError}</p>}
              {csvParseResult?.missingEmailColumn && (
                <p style={fieldErrorStyle}>
                  No "email" column found
                  {csvParseResult.headers.length > 0
                    ? ` — detected columns: ${csvParseResult.headers.join(
                        ", "
                      )}`
                    : ""}
                  . Add an "email" (or "email address") column and re-upload.
                </p>
              )}
            </>
          )}

          <p
            style={{
              margin: "-8px 0 12px",
              fontSize: "12px",
              color: "var(--eaw-color-text-secondary)",
            }}
          >
            {bulkRecipients.length} valid recipient
            {bulkRecipients.length === 1 ? "" : "s"}
          </p>
          {bulkInvalidEntries.length > 0 && (
            <p style={fieldErrorStyle}>
              Ignoring {bulkInvalidEntries.length} invalid address
              {bulkInvalidEntries.length === 1 ? "" : "es"}:{" "}
              {bulkInvalidEntries.join(", ")}
            </p>
          )}
          {bulkErrors.recipients && !csvParseResult?.missingEmailColumn && (
            <p style={fieldErrorStyle}>{bulkErrors.recipients}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-bulk-cc">
            CC (applies once to the whole batch)
          </label>
          <input
            id="eaw-bulk-cc"
            style={inputStyle}
            type="text"
            value={bulkForm.cc}
            onChange={(e) => updateBulkField("cc", e.currentTarget.value)}
            placeholder="manager@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-bulk-bcc">
            BCC (applies once to the whole batch)
          </label>
          <input
            id="eaw-bulk-bcc"
            style={inputStyle}
            type="text"
            value={bulkForm.bcc}
            onChange={(e) => updateBulkField("bcc", e.currentTarget.value)}
            placeholder="audit@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-bulk-subject">
            Subject
          </label>
          <input
            id="eaw-bulk-subject"
            style={inputStyle}
            type="text"
            value={bulkForm.subject}
            onChange={(e) => updateBulkField("subject", e.currentTarget.value)}
          />
          {bulkErrors.subject && (
            <p style={fieldErrorStyle}>{bulkErrors.subject}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-bulk-body">
            Message
          </label>
          <textarea
            id="eaw-bulk-body"
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
            value={bulkForm.body}
            onChange={(e) => updateBulkField("body", e.currentTarget.value)}
          />
          {bulkErrors.body && <p style={fieldErrorStyle}>{bulkErrors.body}</p>}

          <button
            type="submit"
            disabled={bulkSending}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              fontFamily: "var(--eaw-font-family)",
              fontSize: "14px",
              cursor: bulkSending ? "not-allowed" : "pointer",
              opacity: bulkSending ? 0.7 : 1,
            }}
          >
            {bulkSending && bulkProgress
              ? `Sending ${bulkProgress.sent} of ${bulkProgress.total}…`
              : "Send to all"}
          </button>

          {bulkErrorMessage && (
            <p style={{ marginTop: "12px", color: "var(--eaw-color-danger)" }}>
              {bulkErrorMessage}
            </p>
          )}

          {bulkResult && (
            <div style={{ marginTop: "12px" }}>
              <p
                style={{
                  color:
                    bulkResult.failedCount === 0
                      ? "var(--eaw-color-success, #16a34a)"
                      : "var(--eaw-color-danger)",
                }}
              >
                Sent {bulkResult.sentCount}, failed {bulkResult.failedCount}.
              </p>
              {bulkResult.errors.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {bulkResult.errors.map((e) => (
                    <li
                      key={e.email}
                      style={{
                        fontSize: "13px",
                        color: "var(--eaw-color-danger)",
                      }}
                    >
                      {e.email}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export default EmailAutomationWidget;
