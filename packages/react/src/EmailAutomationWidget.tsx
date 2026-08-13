import React, { useEffect, useMemo, useRef, useState } from "react";
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
  BulkComposeFormState,
  BulkRecipient,
  BulkSendResult,
  emptyBulkComposeForm,
  parseRecipients,
  parseRecipientsFromCsv,
  validateBulkComposeForm,
  isBulkComposeFormValid,
  submitBulkComposeForm,
} from "@eaw/core";

type BulkRecipientMode = "paste" | "csv";

export const EmailAutomationWidget: React.FC<WidgetProps> = ({
  mode = "dashboard",
  layout = "full",
  theme: themeOverride,
  baseURL = "/api",
  token,
  onError,
  onEmailSent,
  onBulkSent,
}) => {
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

  // --- Bulk composer state (mode="bulk-composer") ---
  const [bulkForm, setBulkForm] = useState<BulkComposeFormState>(
    emptyBulkComposeForm()
  );
  const [recipientMode, setRecipientMode] =
    useState<BulkRecipientMode>("paste");
  const [parsedRecipients, setParsedRecipients] = useState<BulkRecipient[]>([]);
  const [invalidEntries, setInvalidEntries] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<
    ReturnType<typeof validateBulkComposeForm>
  >({});
  const [bulkTouched, setBulkTouched] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    sent: number;
    total: number;
  } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSendResult | null>(null);
  const [bulkResultError, setBulkResultError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const theme = useMemo(() => resolveTheme(themeOverride), [themeOverride]);
  const cssVars = useMemo(
    () => themeToCssVars(theme) as React.CSSProperties,
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

  // Same touched-gated live validation pattern as the single composer.
  useEffect(() => {
    if (!bulkTouched) return;
    setBulkErrors(validateBulkComposeForm(bulkForm, parsedRecipients));
  }, [bulkForm, parsedRecipients, bulkTouched]);

  function switchRecipientMode(next: BulkRecipientMode) {
    setRecipientMode(next);
    setBulkTouched(true);
    setBulkResult(null);
    setBulkResultError(null);
    // Each input method owns its own recipient list — switching clears
    // whatever the other method had parsed so a stale CSV upload can't
    // silently ride along with a pasted list (or vice versa).
    setParsedRecipients([]);
    setInvalidEntries([]);
    setCsvError(null);
    if (next === "paste") {
      setCsvFileName(null);
      setCsvHeaders([]);
    } else {
      setBulkForm((prev) => ({ ...prev, recipientsRaw: "" }));
    }
  }

  function handlePasteChange(value: string) {
    setBulkTouched(true);
    setBulkResult(null);
    setBulkResultError(null);
    setBulkForm((prev) => ({ ...prev, recipientsRaw: value }));
    const { recipients, invalidEntries: bad } = parseRecipients(value);
    setParsedRecipients(recipients);
    setInvalidEntries(bad);
  }

  function handleCsvFile(file: File | null) {
    setBulkTouched(true);
    setBulkResult(null);
    setBulkResultError(null);
    setCsvFileName(file?.name ?? null);
    if (!file) {
      setParsedRecipients([]);
      setInvalidEntries([]);
      setCsvHeaders([]);
      setCsvError(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const result = parseRecipientsFromCsv(text);
      setParsedRecipients(result.recipients);
      setInvalidEntries(result.invalidEntries);
      setCsvHeaders(
        result.headers.filter(
          (h) =>
            h !== "email" &&
            h.toLowerCase() !== "email" &&
            h.toLowerCase() !== "email address"
        )
      );
      setCsvError(
        result.missingEmailColumn
          ? 'No "Email" column found in this CSV — add one (or "Email Address") and re-upload.'
          : null
      );
    };
    reader.onerror = () => {
      setCsvError("Couldn't read that file — try re-exporting it as CSV.");
    };
    reader.readAsText(file);
  }

  function insertPlaceholder(header: string) {
    const token = `{{${header}}}`;
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? bulkForm.body.length;
      const end = el.selectionEnd ?? bulkForm.body.length;
      const next =
        bulkForm.body.slice(0, start) + token + bulkForm.body.slice(end);
      setBulkForm((prev) => ({ ...prev, body: next }));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      setBulkForm((prev) => ({ ...prev, body: prev.body + token }));
    }
    setBulkTouched(true);
  }

  function updateBulkField(
    field: "cc" | "bcc" | "subject" | "body",
    value: string
  ) {
    setBulkTouched(true);
    setBulkResult(null);
    setBulkResultError(null);
    setBulkForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBulkTouched(true);
    if (csvError) return;
    const errors = validateBulkComposeForm(bulkForm, parsedRecipients);
    setBulkErrors(errors);
    if (!isBulkComposeFormValid(errors)) return;

    setBulkSending(true);
    setBulkResult(null);
    setBulkResultError(null);
    setBulkProgress({ sent: 0, total: parsedRecipients.length });
    try {
      const result = await submitBulkComposeForm(
        adapter,
        bulkForm,
        parsedRecipients,
        (sent, total) => setBulkProgress({ sent, total })
      );
      onBulkSent?.(result);
      setBulkResult(result);
      setBulkForm(emptyBulkComposeForm());
      setParsedRecipients([]);
      setInvalidEntries([]);
      setCsvFileName(null);
      setCsvHeaders([]);
      setBulkTouched(false);
      setBulkErrors({});
    } catch (err) {
      const e2 =
        err instanceof Error ? err : new Error("Failed to send bulk email");
      setBulkResultError(e2.message);
      onError?.(e2);
    } finally {
      setBulkSending(false);
    }
  }

  function updateComposeField(field: keyof ComposeFormState, value: string) {
    setComposeTouched(true);
    setSendResultMessage(null);
    setComposeForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleComposeSubmit(e: React.FormEvent) {
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

  const inputStyle: React.CSSProperties = {
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
  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--eaw-color-text-secondary)",
  };
  const fieldErrorStyle: React.CSSProperties = {
    color: "var(--eaw-color-danger)",
    fontSize: "12px",
    marginTop: "-8px",
    marginBottom: "12px",
  };
  const helpTextStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--eaw-color-text-secondary)",
    margin: "0 0 10px",
  };
  const chipButtonStyle: React.CSSProperties = {
    fontSize: "12px",
    padding: "3px 8px",
    borderRadius: "999px",
    border: "1px solid var(--eaw-color-border)",
    background: "var(--eaw-color-bg)",
    color: "var(--eaw-color-text-primary)",
    fontFamily: "var(--eaw-font-family)",
    cursor: "pointer",
  };
  function tabButtonStyle(active: boolean): React.CSSProperties {
    return {
      padding: "6px 12px",
      borderRadius: "var(--eaw-radius)",
      border: `1px solid ${
        active ? "var(--eaw-color-primary)" : "var(--eaw-color-border)"
      }`,
      background: active ? "var(--eaw-color-primary)" : "var(--eaw-color-bg)",
      color: active ? "#fff" : "var(--eaw-color-text-primary)",
      fontFamily: "var(--eaw-font-family)",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
    };
  }

  return (
    <div
      className="eaw-root"
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
            onChange={(e) => updateComposeField("to", e.target.value)}
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
            onChange={(e) => updateComposeField("cc", e.target.value)}
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
            onChange={(e) => updateComposeField("bcc", e.target.value)}
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
            onChange={(e) => updateComposeField("subject", e.target.value)}
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
            onChange={(e) => updateComposeField("body", e.target.value)}
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

      {mode === "bulk-composer" && (
        <form onSubmit={handleBulkSubmit} noValidate>
          <label style={labelStyle}>Recipients</label>
          <div style={{ display: "flex", gap: "8px", margin: "4px 0 10px" }}>
            <button
              type="button"
              onClick={() => switchRecipientMode("paste")}
              aria-pressed={recipientMode === "paste"}
              style={tabButtonStyle(recipientMode === "paste")}
            >
              Paste list
            </button>
            <button
              type="button"
              onClick={() => switchRecipientMode("csv")}
              aria-pressed={recipientMode === "csv"}
              style={tabButtonStyle(recipientMode === "csv")}
            >
              Upload CSV
            </button>
          </div>

          {recipientMode === "paste" && (
            <>
              <textarea
                id="eaw-bulk-recipients"
                style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
                value={bulkForm.recipientsRaw}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder={
                  "jane@example.com, john@example.com\nor one per line"
                }
              />
              <p style={helpTextStyle}>
                Comma- or newline-separated addresses. No personalization —
                every recipient gets the same body.
              </p>
            </>
          )}

          {recipientMode === "csv" && (
            <>
              <input
                id="eaw-bulk-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
                style={{ marginTop: "4px", marginBottom: "6px" }}
              />
              <p style={helpTextStyle}>
                Needs an "Email" column. Any other column (e.g. firstName,
                company) becomes a per-recipient placeholder — insert it into
                the message below as {"{{"}columnName{"}}"}.
              </p>
              {csvFileName && !csvError && (
                <p
                  style={{
                    ...helpTextStyle,
                    color: "var(--eaw-color-text-primary)",
                  }}
                >
                  {csvFileName} — {parsedRecipients.length} recipient
                  {parsedRecipients.length === 1 ? "" : "s"} found
                  {csvHeaders.length > 0 && (
                    <> · columns: {csvHeaders.join(", ")}</>
                  )}
                </p>
              )}
              {csvHeaders.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginBottom: "10px",
                  }}
                >
                  {csvHeaders.map((header) => (
                    <button
                      key={header}
                      type="button"
                      onClick={() => insertPlaceholder(header)}
                      style={chipButtonStyle}
                      title={`Insert {{${header}}} into the message`}
                    >
                      + {`{{${header}}}`}
                    </button>
                  ))}
                </div>
              )}
              {csvError && <p style={fieldErrorStyle}>{csvError}</p>}
            </>
          )}

          {invalidEntries.length > 0 && (
            <p style={fieldErrorStyle}>
              Skipped {invalidEntries.length} invalid address
              {invalidEntries.length === 1 ? "" : "es"}:{" "}
              {invalidEntries.slice(0, 5).join(", ")}
              {invalidEntries.length > 5 ? ", …" : ""}
            </p>
          )}

          {recipientMode === "paste" && parsedRecipients.length > 0 && (
            <p style={{ ...helpTextStyle, marginTop: "-6px" }}>
              {parsedRecipients.length} valid recipient
              {parsedRecipients.length === 1 ? "" : "s"} ready.
            </p>
          )}

          {bulkErrors.recipients && (
            <p style={fieldErrorStyle}>{bulkErrors.recipients}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-bulk-cc">
            CC
          </label>
          <input
            id="eaw-bulk-cc"
            style={inputStyle}
            type="text"
            value={bulkForm.cc}
            onChange={(e) => updateBulkField("cc", e.target.value)}
            placeholder="cc1@example.com, cc2@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-bulk-bcc">
            BCC
          </label>
          <input
            id="eaw-bulk-bcc"
            style={inputStyle}
            type="text"
            value={bulkForm.bcc}
            onChange={(e) => updateBulkField("bcc", e.target.value)}
            placeholder="bcc1@example.com"
          />

          <label style={labelStyle} htmlFor="eaw-bulk-subject">
            Subject
          </label>
          <input
            id="eaw-bulk-subject"
            style={inputStyle}
            type="text"
            value={bulkForm.subject}
            onChange={(e) => updateBulkField("subject", e.target.value)}
          />
          {bulkErrors.subject && (
            <p style={fieldErrorStyle}>{bulkErrors.subject}</p>
          )}

          <label style={labelStyle} htmlFor="eaw-bulk-body">
            Message
          </label>
          <textarea
            id="eaw-bulk-body"
            ref={bodyRef}
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
            value={bulkForm.body}
            onChange={(e) => updateBulkField("body", e.target.value)}
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
            {bulkSending
              ? "Sending…"
              : parsedRecipients.length > 0
              ? `Send to ${parsedRecipients.length} recipient${
                  parsedRecipients.length === 1 ? "" : "s"
                }`
              : "Send"}
          </button>

          {bulkSending && bulkProgress && (
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  height: "6px",
                  borderRadius: "999px",
                  background: "var(--eaw-color-border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: bulkProgress.total
                      ? `${Math.min(
                          100,
                          (bulkProgress.sent / bulkProgress.total) * 100
                        )}%`
                      : "0%",
                    background: "var(--eaw-color-primary)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
              <p style={helpTextStyle}>
                {bulkProgress.sent} / {bulkProgress.total}
              </p>
            </div>
          )}

          {bulkResult && (
            <div style={{ marginTop: "12px" }}>
              <p
                style={{
                  color: "var(--eaw-color-success, #16a34a)",
                  margin: 0,
                }}
              >
                Sent {bulkResult.sentCount} of{" "}
                {bulkResult.sentCount + bulkResult.failedCount}.
                {bulkResult.failedCount > 0 &&
                  ` ${bulkResult.failedCount} failed.`}
              </p>
              {bulkResult.errors.length > 0 && (
                <ul
                  style={{
                    margin: "6px 0 0",
                    paddingLeft: "18px",
                    color: "var(--eaw-color-danger)",
                    fontSize: "13px",
                  }}
                >
                  {bulkResult.errors.slice(0, 5).map((err) => (
                    <li key={err.email}>
                      {err.email}: {err.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {bulkResultError && (
            <p style={{ marginTop: "12px", color: "var(--eaw-color-danger)" }}>
              {bulkResultError}
            </p>
          )}
        </form>
      )}

      {mode === "dashboard" && (
        <p style={{ color: "var(--eaw-color-text-secondary)" }}>
          Dashboard content coming in a later milestone.
        </p>
      )}
    </div>
  );
};
