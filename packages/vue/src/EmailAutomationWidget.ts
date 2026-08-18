import {
  defineComponent,
  h,
  ref,
  computed,
  watch,
  onBeforeUnmount,
  type PropType,
} from "vue";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  MailboxItem,
  WidgetMode,
  WidgetTheme,
  BulkSendError,
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
  CsvRecipientParseResult,
} from "@eaw/core";

type BulkRecipientSource = "paste" | "csv";

/**
 * Reads a File's text content via FileReader rather than the newer
 * `File.prototype.text()` — mirrors the same choice made in the React
 * wrapper (FileReader is reliably supported across jsdom versions used
 * in test environments; `File.prototype.text()` isn't).
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
 * `<EmailAutomationWidget>` — the Vue 3 wrapper around the Core SDK.
 * Mirrors `@eaw/react`'s `EmailAutomationWidget` behaviour so every
 * framework wrapper stays behaviourally identical; only the rendering
 * layer differs (Vue's `h()` render function here, JSX in React).
 *
 * Usage:
 *   <EmailAutomationWidget mode="mailbox" base-url="/api" :token="token" />
 */
export const EmailAutomationWidget = defineComponent({
  name: "EmailAutomationWidget",
  props: {
    mode: { type: String as PropType<WidgetMode>, default: "dashboard" },
    layout: { type: String as PropType<"full" | "embedded">, default: "full" },
    theme: {
      type: Object as PropType<Partial<WidgetTheme>>,
      default: undefined,
    },
    baseUrl: { type: String, default: "/api" },
    token: { type: String, default: undefined },
    onError: {
      type: Function as PropType<(error: Error) => void>,
      default: undefined,
    },
    onEmailSent: {
      type: Function as PropType<(entry: unknown) => void>,
      default: undefined,
    },
    onBulkSent: {
      type: Function as PropType<(result: BulkSendResult) => void>,
      default: undefined,
    },
  },
  emits: ["error", "email-sent", "bulk-sent"],
  setup(props, { emit }) {
    const emails = ref<MailboxItem[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // ------------------------------------------------------------------
    // Single compose (mode="composer")
    // ------------------------------------------------------------------
    const composeForm = ref<ComposeFormState>(emptyComposeForm());
    const composeErrors = ref<ComposeValidationErrors>({});
    const composeTouched = ref(false);
    const sending = ref(false);
    const sendResultMessage = ref<string | null>(null);

    watch(
      composeForm,
      () => {
        if (!composeTouched.value) return;
        composeErrors.value = validateComposeForm(composeForm.value);
      },
      { deep: true }
    );

    function updateComposeField(field: keyof ComposeFormState, value: string) {
      composeTouched.value = true;
      sendResultMessage.value = null;
      composeForm.value = { ...composeForm.value, [field]: value };
    }

    async function handleComposeSubmit(e: Event) {
      e.preventDefault();
      composeTouched.value = true;
      const errors = validateComposeForm(composeForm.value);
      composeErrors.value = errors;
      if (!isComposeFormValid(errors)) return;

      sending.value = true;
      sendResultMessage.value = null;
      try {
        const entry = await submitComposeForm(adapter.value, composeForm.value);
        emit("email-sent", entry);
        sendResultMessage.value = `Sent to ${entry.to}.`;
        composeForm.value = emptyComposeForm();
        composeTouched.value = false;
        composeErrors.value = {};
      } catch (err) {
        const e2 =
          err instanceof Error ? err : new Error("Failed to send email");
        sendResultMessage.value = e2.message;
        emit("error", e2);
      } finally {
        sending.value = false;
      }
    }

    // ------------------------------------------------------------------
    // Bulk compose (mode="bulk")
    // ------------------------------------------------------------------
    const bulkForm = ref<BulkComposeFormState>(emptyBulkComposeForm());
    const bulkErrors = ref<BulkComposeValidationErrors>({});
    const bulkTouched = ref(false);
    const bulkSending = ref(false);
    const bulkProgress = ref<{ sent: number; total: number } | null>(null);
    const bulkResult = ref<BulkSendResult | null>(null);
    const bulkErrorMessage = ref<string | null>(null);

    // Two ways to supply recipients for a bulk send: paste a plain list,
    // or upload a CSV (which also carries personalization columns). Only
    // one is "active" at a time — switching sources doesn't merge the
    // two, so a user who pasted a list then also uploaded a CSV isn't
    // left wondering which recipients actually get used.
    const bulkRecipientSource = ref<BulkRecipientSource>("paste");
    const csvFileName = ref<string | null>(null);
    const csvParseResult = ref<CsvRecipientParseResult | null>(null);
    const csvReadError = ref<string | null>(null);

    // Recipients are re-parsed live from the raw textarea on every
    // keystroke (parseRecipients is cheap), so invalid-entry warnings
    // and the recipient count update immediately instead of only at
    // submit time.
    const pasteParsed = computed(() =>
      parseRecipients(bulkForm.value.recipientsRaw)
    );

    const bulkRecipients = computed(() =>
      bulkRecipientSource.value === "csv"
        ? csvParseResult.value?.recipients ?? []
        : pasteParsed.value.recipients
    );
    const bulkInvalidEntries = computed(() =>
      bulkRecipientSource.value === "csv"
        ? csvParseResult.value?.invalidEntries ?? []
        : pasteParsed.value.invalidEntries
    );

    watch(
      [bulkForm, bulkRecipients],
      () => {
        if (!bulkTouched.value) return;
        bulkErrors.value = validateBulkComposeForm(
          bulkForm.value,
          bulkRecipients.value
        );
      },
      { deep: true }
    );

    function updateBulkField(field: keyof BulkComposeFormState, value: string) {
      bulkTouched.value = true;
      bulkResult.value = null;
      bulkErrorMessage.value = null;
      bulkForm.value = { ...bulkForm.value, [field]: value };
    }

    function switchBulkRecipientSource(source: BulkRecipientSource) {
      bulkRecipientSource.value = source;
      bulkTouched.value = true;
      bulkResult.value = null;
      bulkErrorMessage.value = null;
    }

    async function handleCsvFileChange(e: Event) {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0] ?? null;
      bulkTouched.value = true;
      bulkResult.value = null;
      bulkErrorMessage.value = null;

      if (!file) {
        csvFileName.value = null;
        csvParseResult.value = null;
        csvReadError.value = null;
        return;
      }

      csvFileName.value = file.name;
      try {
        const text = await readFileAsText(file);
        csvReadError.value = null;
        csvParseResult.value = parseRecipientsFromCsv(text);
      } catch {
        csvReadError.value =
          "Could not read that file. Please upload a CSV file.";
        csvParseResult.value = null;
      }
    }

    async function handleBulkSubmit(e: Event) {
      e.preventDefault();
      bulkTouched.value = true;
      const errors = validateBulkComposeForm(
        bulkForm.value,
        bulkRecipients.value
      );
      bulkErrors.value = errors;
      if (!isBulkComposeFormValid(errors)) return;

      bulkSending.value = true;
      bulkResult.value = null;
      bulkErrorMessage.value = null;
      bulkProgress.value = { sent: 0, total: bulkRecipients.value.length };
      try {
        const result = await submitBulkComposeForm(
          adapter.value,
          bulkForm.value,
          bulkRecipients.value,
          (sent, total) => {
            bulkProgress.value = { sent, total };
          }
        );
        emit("bulk-sent", result);
        bulkResult.value = result;
        bulkForm.value = emptyBulkComposeForm();
        bulkTouched.value = false;
        bulkErrors.value = {};
        csvFileName.value = null;
        csvParseResult.value = null;
        csvReadError.value = null;
      } catch (err) {
        const e2 =
          err instanceof Error ? err : new Error("Failed to send bulk email");
        bulkErrorMessage.value = e2.message;
        emit("error", e2);
      } finally {
        bulkSending.value = false;
      }
    }

    // ------------------------------------------------------------------
    // Shared
    // ------------------------------------------------------------------
    const resolvedTheme = computed(() => resolveTheme(props.theme));
    const cssVars = computed(() => themeToCssVars(resolvedTheme.value));

    const adapter = computed(() => {
      const client = new ApiClient(
        props.baseUrl,
        props.token ? { type: "Bearer", token: props.token } : undefined
      );
      return createDefaultAdapter(client);
    });

    let cancelled = false;
    onBeforeUnmount(() => {
      cancelled = true;
    });

    async function loadMailbox() {
      cancelled = false;
      loading.value = true;
      error.value = null;
      try {
        const result = await adapter.value.mailbox();
        if (!cancelled) emails.value = result.items;
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load mailbox";
        error.value = message;
        const e = err instanceof Error ? err : new Error(message);
        // NOTE: don't also call `props.onError?.(e)` here — Vue treats a
        // prop named `onError` as an automatic listener for the `error`
        // emit (any `emits: [...]` entry gets this treatment for a
        // same-named `on<Event>` prop), so `emit("error", e)` already
        // invokes it. Calling both fired the callback twice per failure.
        emit("error", e);
      } finally {
        if (!cancelled) loading.value = false;
      }
    }

    watch(
      () => [props.mode, props.baseUrl, props.token],
      () => {
        if (props.mode === "mailbox") loadMailbox();
      },
      { immediate: true }
    );

    const inputStyle = {
      width: "100%",
      boxSizing: "border-box" as const,
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
    const labelStyle = {
      fontSize: "13px",
      fontWeight: 600,
      color: "var(--eaw-color-text-secondary)",
    };
    const fieldErrorStyle = {
      color: "var(--eaw-color-danger)",
      fontSize: "12px",
      marginTop: "-8px",
      marginBottom: "12px",
    };

    function renderComposer() {
      return h("form", { novalidate: true, onSubmit: handleComposeSubmit }, [
        h("label", { style: labelStyle, for: "eaw-compose-to" }, "To"),
        h("input", {
          id: "eaw-compose-to",
          style: inputStyle,
          type: "text",
          value: composeForm.value.to,
          placeholder: "recipient@example.com",
          onInput: (e: Event) =>
            updateComposeField("to", (e.target as HTMLInputElement).value),
        }),
        composeErrors.value.to &&
          h("p", { style: fieldErrorStyle }, composeErrors.value.to),

        h("label", { style: labelStyle, for: "eaw-compose-cc" }, "CC"),
        h("input", {
          id: "eaw-compose-cc",
          style: inputStyle,
          type: "text",
          value: composeForm.value.cc,
          placeholder: "cc1@example.com, cc2@example.com",
          onInput: (e: Event) =>
            updateComposeField("cc", (e.target as HTMLInputElement).value),
        }),

        h("label", { style: labelStyle, for: "eaw-compose-bcc" }, "BCC"),
        h("input", {
          id: "eaw-compose-bcc",
          style: inputStyle,
          type: "text",
          value: composeForm.value.bcc,
          placeholder: "bcc1@example.com",
          onInput: (e: Event) =>
            updateComposeField("bcc", (e.target as HTMLInputElement).value),
        }),

        h(
          "label",
          { style: labelStyle, for: "eaw-compose-subject" },
          "Subject"
        ),
        h("input", {
          id: "eaw-compose-subject",
          style: inputStyle,
          type: "text",
          value: composeForm.value.subject,
          onInput: (e: Event) =>
            updateComposeField("subject", (e.target as HTMLInputElement).value),
        }),
        composeErrors.value.subject &&
          h("p", { style: fieldErrorStyle }, composeErrors.value.subject),

        h("label", { style: labelStyle, for: "eaw-compose-body" }, "Message"),
        h("textarea", {
          id: "eaw-compose-body",
          style: { ...inputStyle, minHeight: "120px", resize: "vertical" },
          value: composeForm.value.body,
          onInput: (e: Event) =>
            updateComposeField("body", (e.target as HTMLTextAreaElement).value),
        }),
        composeErrors.value.body &&
          h("p", { style: fieldErrorStyle }, composeErrors.value.body),

        h(
          "button",
          {
            type: "submit",
            disabled: sending.value,
            style: {
              padding: "8px 16px",
              borderRadius: "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              fontFamily: "var(--eaw-font-family)",
              fontSize: "14px",
              cursor: sending.value ? "not-allowed" : "pointer",
              opacity: sending.value ? 0.7 : 1,
            },
          },
          sending.value ? "Sending…" : "Send"
        ),

        sendResultMessage.value &&
          h(
            "p",
            {
              style: {
                marginTop: "12px",
                color: sendResultMessage.value.startsWith("Sent to")
                  ? "var(--eaw-color-success, #16a34a)"
                  : "var(--eaw-color-danger)",
              },
            },
            sendResultMessage.value
          ),
      ]);
    }

    function renderBulkComposer() {
      const recipients = bulkRecipients.value;
      const invalidEntries = bulkInvalidEntries.value;

      return h("form", { novalidate: true, onSubmit: handleBulkSubmit }, [
        h(
          "div",
          {
            role: "tablist",
            "aria-label": "Recipient source",
            style: { display: "flex", gap: "4px", marginBottom: "10px" },
          },
          [
            h(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": bulkRecipientSource.value === "paste",
                onClick: () => switchBulkRecipientSource("paste"),
                style: {
                  padding: "6px 12px",
                  borderRadius: "var(--eaw-radius)",
                  border: "1px solid var(--eaw-color-border)",
                  background:
                    bulkRecipientSource.value === "paste"
                      ? "var(--eaw-color-primary)"
                      : "var(--eaw-color-bg)",
                  color:
                    bulkRecipientSource.value === "paste"
                      ? "#fff"
                      : "var(--eaw-color-text-primary)",
                  fontFamily: "var(--eaw-font-family)",
                  fontSize: "13px",
                  cursor: "pointer",
                },
              },
              "Paste list"
            ),
            h(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": bulkRecipientSource.value === "csv",
                onClick: () => switchBulkRecipientSource("csv"),
                style: {
                  padding: "6px 12px",
                  borderRadius: "var(--eaw-radius)",
                  border: "1px solid var(--eaw-color-border)",
                  background:
                    bulkRecipientSource.value === "csv"
                      ? "var(--eaw-color-primary)"
                      : "var(--eaw-color-bg)",
                  color:
                    bulkRecipientSource.value === "csv"
                      ? "#fff"
                      : "var(--eaw-color-text-primary)",
                  fontFamily: "var(--eaw-font-family)",
                  fontSize: "13px",
                  cursor: "pointer",
                },
              },
              "Upload CSV"
            ),
          ]
        ),

        bulkRecipientSource.value === "paste" &&
          h("div", [
            h(
              "label",
              { style: labelStyle, for: "eaw-bulk-recipients" },
              "Recipients"
            ),
            h("textarea", {
              id: "eaw-bulk-recipients",
              style: { ...inputStyle, minHeight: "100px", resize: "vertical" },
              value: bulkForm.value.recipientsRaw,
              placeholder:
                "one@example.com, two@example.com\nthree@example.com",
              onInput: (e: Event) =>
                updateBulkField(
                  "recipientsRaw",
                  (e.target as HTMLTextAreaElement).value
                ),
            }),
          ]),

        bulkRecipientSource.value === "csv" &&
          h("div", [
            h("label", { style: labelStyle, for: "eaw-bulk-csv" }, "CSV file"),
            h("input", {
              id: "eaw-bulk-csv",
              style: { ...inputStyle, padding: "6px 0" },
              type: "file",
              accept: ".csv,text/csv",
              onChange: handleCsvFileChange,
            }),
            h(
              "p",
              {
                style: {
                  margin: "-8px 0 4px",
                  fontSize: "12px",
                  color: "var(--eaw-color-text-secondary)",
                },
              },
              [
                'First row must be a header row. A column named "email" (or ' +
                  '"email address") is used as the recipient; every other column ' +
                  "becomes a personalization placeholder, e.g. ",
                h("code", null, "{{name}}"),
                ".",
              ]
            ),
            csvFileName.value &&
              h(
                "p",
                {
                  style: {
                    margin: "0 0 4px",
                    fontSize: "12px",
                    color: "var(--eaw-color-text-secondary)",
                  },
                },
                `Loaded: ${csvFileName.value}` +
                  (csvParseResult.value &&
                  !csvParseResult.value.missingEmailColumn
                    ? ` — columns: ${csvParseResult.value.headers.join(", ")}`
                    : "")
              ),
            csvReadError.value &&
              h("p", { style: fieldErrorStyle }, csvReadError.value),
            csvParseResult.value?.missingEmailColumn &&
              h(
                "p",
                { style: fieldErrorStyle },
                `No "email" column found` +
                  (csvParseResult.value.headers.length > 0
                    ? ` — detected columns: ${csvParseResult.value.headers.join(
                        ", "
                      )}`
                    : "") +
                  `. Add an "email" (or "email address") column and re-upload.`
              ),
          ]),

        h(
          "p",
          {
            style: {
              margin: "-8px 0 12px",
              fontSize: "12px",
              color: "var(--eaw-color-text-secondary)",
            },
          },
          `${recipients.length} valid recipient${
            recipients.length === 1 ? "" : "s"
          }`
        ),
        invalidEntries.length > 0 &&
          h(
            "p",
            { style: fieldErrorStyle },
            `Ignoring ${invalidEntries.length} invalid address${
              invalidEntries.length === 1 ? "" : "es"
            }: ${invalidEntries.join(", ")}`
          ),
        bulkErrors.value.recipients &&
          !csvParseResult.value?.missingEmailColumn &&
          h("p", { style: fieldErrorStyle }, bulkErrors.value.recipients),

        h(
          "label",
          { style: labelStyle, for: "eaw-bulk-cc" },
          "CC (applies once to the whole batch)"
        ),
        h("input", {
          id: "eaw-bulk-cc",
          style: inputStyle,
          type: "text",
          value: bulkForm.value.cc,
          placeholder: "manager@example.com",
          onInput: (e: Event) =>
            updateBulkField("cc", (e.target as HTMLInputElement).value),
        }),

        h(
          "label",
          { style: labelStyle, for: "eaw-bulk-bcc" },
          "BCC (applies once to the whole batch)"
        ),
        h("input", {
          id: "eaw-bulk-bcc",
          style: inputStyle,
          type: "text",
          value: bulkForm.value.bcc,
          placeholder: "audit@example.com",
          onInput: (e: Event) =>
            updateBulkField("bcc", (e.target as HTMLInputElement).value),
        }),

        h("label", { style: labelStyle, for: "eaw-bulk-subject" }, "Subject"),
        h("input", {
          id: "eaw-bulk-subject",
          style: inputStyle,
          type: "text",
          value: bulkForm.value.subject,
          onInput: (e: Event) =>
            updateBulkField("subject", (e.target as HTMLInputElement).value),
        }),
        bulkErrors.value.subject &&
          h("p", { style: fieldErrorStyle }, bulkErrors.value.subject),

        h("label", { style: labelStyle, for: "eaw-bulk-body" }, "Message"),
        h("textarea", {
          id: "eaw-bulk-body",
          style: { ...inputStyle, minHeight: "120px", resize: "vertical" },
          value: bulkForm.value.body,
          onInput: (e: Event) =>
            updateBulkField("body", (e.target as HTMLTextAreaElement).value),
        }),
        bulkErrors.value.body &&
          h("p", { style: fieldErrorStyle }, bulkErrors.value.body),

        h(
          "button",
          {
            type: "submit",
            disabled: bulkSending.value,
            style: {
              padding: "8px 16px",
              borderRadius: "var(--eaw-radius)",
              border: "none",
              background: "var(--eaw-color-primary)",
              color: "#fff",
              fontFamily: "var(--eaw-font-family)",
              fontSize: "14px",
              cursor: bulkSending.value ? "not-allowed" : "pointer",
              opacity: bulkSending.value ? 0.7 : 1,
            },
          },
          bulkSending.value && bulkProgress.value
            ? `Sending ${bulkProgress.value.sent} of ${bulkProgress.value.total}…`
            : "Send to all"
        ),

        bulkErrorMessage.value &&
          h(
            "p",
            { style: { marginTop: "12px", color: "var(--eaw-color-danger)" } },
            bulkErrorMessage.value
          ),

        bulkResult.value &&
          h("div", { style: { marginTop: "12px" } }, [
            h(
              "p",
              {
                style: {
                  color:
                    bulkResult.value.failedCount === 0
                      ? "var(--eaw-color-success, #16a34a)"
                      : "var(--eaw-color-danger)",
                },
              },
              `Sent ${bulkResult.value.sentCount}, failed ${bulkResult.value.failedCount}.`
            ),
            bulkResult.value.errors.length > 0 &&
              h(
                "ul",
                { style: { listStyle: "none", margin: 0, padding: 0 } },
                bulkResult.value.errors.map((err: BulkSendError) =>
                  h(
                    "li",
                    {
                      key: err.email,
                      style: {
                        fontSize: "13px",
                        color: "var(--eaw-color-danger)",
                      },
                    },
                    `${err.email}: ${err.error}`
                  )
                )
              ),
          ]),
      ]);
    }

    return () =>
      h(
        "div",
        {
          class: "eaw-root",
          "data-layout": props.layout,
          style: {
            ...cssVars.value,
            padding: "20px",
            border: "1px solid var(--eaw-color-border)",
            borderRadius: "var(--eaw-radius)",
            background: "var(--eaw-color-bg)",
            color: "var(--eaw-color-text-primary)",
            fontFamily: "var(--eaw-font-family)",
          },
        },
        [
          h(
            "h2",
            { style: { margin: "0 0 12px", fontSize: "18px" } },
            "Email Automation Widget"
          ),

          props.mode === "mailbox" &&
            (loading.value
              ? h("p", null, "Loading mailbox…")
              : error.value
              ? h(
                  "p",
                  { style: { color: "var(--eaw-color-danger)" } },
                  error.value
                )
              : h(
                  "ul",
                  { style: { listStyle: "none", margin: 0, padding: 0 } },
                  emails.value.length === 0
                    ? [h("li", null, "No messages yet.")]
                    : emails.value.map((mail) =>
                        h(
                          "li",
                          {
                            key: mail.id,
                            style: {
                              padding: "8px 0",
                              borderBottom: "1px solid var(--eaw-color-border)",
                            },
                          },
                          [
                            h("strong", null, mail.subject),
                            " ",
                            h(
                              "span",
                              {
                                style: {
                                  color: "var(--eaw-color-text-secondary)",
                                },
                              },
                              `— ${mail.from}`
                            ),
                          ]
                        )
                      )
                )),

          props.mode === "composer" && renderComposer(),

          props.mode === "dashboard" &&
            h(
              "p",
              { style: { color: "var(--eaw-color-text-secondary)" } },
              "Dashboard content coming in a later milestone."
            ),

          props.mode === "bulk" && renderBulkComposer(),
        ]
      );
  },
});

export default EmailAutomationWidget;
