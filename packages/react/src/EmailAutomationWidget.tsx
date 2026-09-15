import React, { useEffect, useMemo, useState } from "react";
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
  DashboardData,
  loadDashboardData,
  dashboardStats,
  statusLabel,
  statusTone,
  LogsPage,
  loadLogsPage,
  toLogDetailView,
  LOG_STATUS_FILTER_OPTIONS,
  EmailStatus,
  debounce,
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
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logsPage, setLogsPage] = useState<LogsPage | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsQueryInput, setLogsQueryInput] = useState("");
  const [logsQuery, setLogsQuery] = useState("");
  const [logsStatus, setLogsStatus] = useState<EmailStatus | "all">("all");
  const [logsPageNum, setLogsPageNum] = useState(1);
  const [selectedLogId, setSelectedLogId] = useState<string | number | null>(
    null
  );

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

  const selectedLog = useMemo(
    () => logsPage?.items.find((l) => l.id === selectedLogId) ?? null,
    [logsPage, selectedLogId]
  );
  const selectedLogDetail = useMemo(
    () => (selectedLog ? toLogDetailView(selectedLog) : null),
    [selectedLog]
  );

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

  // Debounced so typing in the logs search box doesn't fire a request
  // per keystroke — only once the user pauses for 300ms. Also resets to
  // page 1, since a new search invalidates whatever page the user was on.
  const debouncedApplyLogsQuery = useMemo(
    () =>
      debounce((q: string) => {
        setLogsQuery(q);
        setLogsPageNum(1);
      }, 300),
    []
  );

  function updateLogsQueryInput(value: string) {
    setLogsQueryInput(value);
    debouncedApplyLogsQuery(value);
  }

  function updateLogsStatus(value: EmailStatus | "all") {
    setLogsStatus(value);
    setLogsPageNum(1);
    setSelectedLogId(null);
  }

  useEffect(() => {
    if (mode !== "logs") return;

    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);

    loadLogsPage(adapter, {
      page: logsPageNum,
      query: logsQuery,
      status: logsStatus === "all" ? undefined : logsStatus,
    })
      .then((page) => {
        if (!cancelled) setLogsPage(page);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLogsError(err.message);
        onError?.(err);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, adapter, onError, logsPageNum, logsQuery, logsStatus]);

  useEffect(() => {
    if (mode !== "dashboard") return;

    let cancelled = false;
    setDashboardLoading(true);
    setDashboardError(null);

    loadDashboardData(adapter)
      .then((data) => {
        if (!cancelled) setDashboardData(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setDashboardError(err.message);
        onError?.(err);
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
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

  async function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
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

  async function handleBulkSubmit(e: React.FormEvent) {
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

      {mode === "dashboard" && (
        <div>
          {dashboardLoading && <p>Loading dashboard…</p>}
          {dashboardError && (
            <p style={{ color: "var(--eaw-color-danger)" }}>{dashboardError}</p>
          )}
          {!dashboardLoading && !dashboardError && dashboardData && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                {dashboardStats(dashboardData.analytics).map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      padding: "12px",
                      borderRadius: "var(--eaw-radius)",
                      border: "1px solid var(--eaw-color-border)",
                      background: "var(--eaw-color-bg)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--eaw-color-text-secondary)",
                        marginBottom: "4px",
                      }}
                    >
                      {stat.label}
                    </div>
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        color:
                          stat.tone === "danger"
                            ? "var(--eaw-color-danger)"
                            : stat.tone === "success"
                            ? "var(--eaw-color-success, #16a34a)"
                            : "var(--eaw-color-text-primary)",
                      }}
                    >
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>
                Recent mailbox
              </h3>
              <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
                {dashboardData.recentMailbox.map((mail) => (
                  <li
                    key={mail.id}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid var(--eaw-color-border)",
                      fontSize: "13px",
                    }}
                  >
                    <strong>{mail.subject}</strong>{" "}
                    <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                      — {mail.from}
                    </span>
                  </li>
                ))}
                {dashboardData.recentMailbox.length === 0 && (
                  <li style={{ fontSize: "13px" }}>No messages yet.</li>
                )}
              </ul>

              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>
                Recent activity
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {dashboardData.recentLogs.map((log) => (
                  <li
                    key={log.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--eaw-color-border)",
                      fontSize: "13px",
                    }}
                  >
                    <span>
                      <strong>{log.subject}</strong>{" "}
                      <span
                        style={{ color: "var(--eaw-color-text-secondary)" }}
                      >
                        — {log.to}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        border: "1px solid currentColor",
                        color:
                          statusTone(log.status) === "danger"
                            ? "var(--eaw-color-danger)"
                            : statusTone(log.status) === "success"
                            ? "var(--eaw-color-success, #16a34a)"
                            : "var(--eaw-color-text-secondary)",
                      }}
                    >
                      {statusLabel(log.status)}
                    </span>
                  </li>
                ))}
                {dashboardData.recentLogs.length === 0 && (
                  <li style={{ fontSize: "13px" }}>No recent activity.</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      {mode === "logs" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <input
              type="text"
              aria-label="Search logs"
              placeholder="Search by recipient or subject…"
              value={logsQueryInput}
              onChange={(e) => updateLogsQueryInput(e.target.value)}
              style={{ ...inputStyle, margin: 0, flex: 1 }}
            />
            <select
              aria-label="Filter by status"
              value={logsStatus}
              onChange={(e) =>
                updateLogsStatus(e.target.value as EmailStatus | "all")
              }
              style={{ ...inputStyle, margin: 0, width: "160px" }}
            >
              {LOG_STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {logsLoading && <p>Loading logs…</p>}
          {logsError && (
            <p style={{ color: "var(--eaw-color-danger)" }}>{logsError}</p>
          )}

          {!logsLoading && !logsError && logsPage && (
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {logsPage.items.map((log) => (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedLogId(log.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "8px 0",
                        borderBottom: "1px solid var(--eaw-color-border)",
                        border: "none",
                        borderBottomWidth: "1px",
                        borderBottomStyle: "solid",
                        borderBottomColor: "var(--eaw-color-border)",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        font: "inherit",
                        color: "inherit",
                      }}
                    >
                      <span>
                        <strong>{log.subject}</strong>{" "}
                        <span
                          style={{ color: "var(--eaw-color-text-secondary)" }}
                        >
                          — {log.to}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: "1px solid currentColor",
                          color:
                            statusTone(log.status) === "danger"
                              ? "var(--eaw-color-danger)"
                              : statusTone(log.status) === "success"
                              ? "var(--eaw-color-success, #16a34a)"
                              : "var(--eaw-color-text-secondary)",
                        }}
                      >
                        {statusLabel(log.status)}
                      </span>
                    </button>
                  </li>
                ))}
                {logsPage.items.length === 0 && <li>No logs found.</li>}
              </ul>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "12px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                  Page {logsPage.page} of {logsPage.totalPages} (
                  {logsPage.total} total)
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    disabled={!logsPage.hasPrevPage}
                    onClick={() => setLogsPageNum((p) => Math.max(1, p - 1))}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--eaw-radius)",
                      border: "1px solid var(--eaw-color-border)",
                      background: "var(--eaw-color-bg)",
                      color: "var(--eaw-color-text-primary)",
                      cursor: logsPage.hasPrevPage ? "pointer" : "not-allowed",
                      opacity: logsPage.hasPrevPage ? 1 : 0.5,
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!logsPage.hasNextPage}
                    onClick={() => setLogsPageNum((p) => p + 1)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--eaw-radius)",
                      border: "1px solid var(--eaw-color-border)",
                      background: "var(--eaw-color-bg)",
                      color: "var(--eaw-color-text-primary)",
                      cursor: logsPage.hasNextPage ? "pointer" : "not-allowed",
                      opacity: logsPage.hasNextPage ? 1 : 0.5,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {selectedLogDetail && (
            <div
              role="dialog"
              aria-label="Message detail"
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "var(--eaw-radius)",
                border: "1px solid var(--eaw-color-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>
                  {selectedLogDetail.subject}
                </h3>
                <button
                  type="button"
                  aria-label="Close message detail"
                  onClick={() => setSelectedLogId(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "16px",
                    lineHeight: 1,
                    color: "var(--eaw-color-text-secondary)",
                  }}
                >
                  ×
                </button>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                To: {selectedLogDetail.to}
              </p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                Status: {selectedLogDetail.statusLabel}
              </p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                Sent: {selectedLogDetail.sentAt}
              </p>
              {selectedLogDetail.openedAt && (
                <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                  Opened: {selectedLogDetail.openedAt}
                </p>
              )}
              {selectedLogDetail.errorMessage && (
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: "13px",
                    color: "var(--eaw-color-danger)",
                  }}
                >
                  Error: {selectedLogDetail.errorMessage}
                </p>
              )}
            </div>
          )}
        </div>
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
                  updateBulkField("recipientsRaw", e.target.value)
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
            onChange={(e) => updateBulkField("cc", e.target.value)}
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
            onChange={(e) => updateBulkField("bcc", e.target.value)}
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
};
