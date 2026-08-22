import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./EmailAutomationWidgetElement";
import type { EmailAutomationWidgetElement } from "./EmailAutomationWidgetElement";

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

function mockFetchPending() {
  global.fetch = vi
    .fn()
    .mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
}

function mount(
  attrs: Record<string, string> = {}
): EmailAutomationWidgetElement {
  const el = document.createElement(
    "email-automation-widget"
  ) as EmailAutomationWidgetElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

/**
 * Waits one microtask/timer turn (for pending promises like the mocked
 * fetch or FileReader to settle) and then for Lit's next render pass to
 * flush. Several of the async handlers in the component (compose submit,
 * bulk submit, CSV file read) need more than a single `updateComplete`
 * because there's a promise resolution *between* the state changes and
 * the resulting re-render.
 */
async function flush(el: EmailAutomationWidgetElement) {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

function getField(
  el: EmailAutomationWidgetElement,
  id: string
): HTMLInputElement | HTMLTextAreaElement {
  const field = el.shadowRoot!.querySelector(`#${id}`);
  if (!field) throw new Error(`No field found with id "${id}"`);
  return field as HTMLInputElement | HTMLTextAreaElement;
}

async function setValue(
  el: EmailAutomationWidgetElement,
  id: string,
  value: string
) {
  const field = getField(el, id);
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await el.updateComplete;
}

function getButtonByText(
  el: EmailAutomationWidgetElement,
  text: RegExp | string
): HTMLButtonElement {
  const buttons = Array.from(el.shadowRoot!.querySelectorAll("button"));
  const match = buttons.find((b) => {
    const content = b.textContent?.trim() ?? "";
    return typeof text === "string" ? content === text : text.test(content);
  });
  if (!match) {
    throw new Error(`No button found matching ${text}`);
  }
  return match as HTMLButtonElement;
}

async function clickButton(
  el: EmailAutomationWidgetElement,
  text: RegExp | string
) {
  getButtonByText(el, text).click();
  await el.updateComplete;
}

function csvFile(contents: string, name = "recipients.csv"): File {
  return new File([contents], name, { type: "text/csv" });
}

/**
 * Some of this component's `html` templates wrap text across multiple
 * source lines (e.g. `Sent ${count}, failed\n${count}.`), which Lit
 * renders with the literal newline/indentation intact — unlike
 * `@testing-library`'s text matchers, plain `shadowRoot.textContent`
 * does not collapse that whitespace. Assertions on multi-word phrases
 * should go through this helper rather than comparing against
 * `el.shadowRoot!.textContent` directly.
 */
function text(el: EmailAutomationWidgetElement): string {
  return (el.shadowRoot!.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function setCsvFile(
  el: EmailAutomationWidgetElement,
  id: string,
  file: File
) {
  const input = getField(el, id) as HTMLInputElement;
  // jsdom's `files` is normally read-only; override it directly rather
  // than trying to build a real FileList via DataTransfer (unreliable
  // across jsdom versions).
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // The change handler reads the file asynchronously (FileReader), so
  // this needs two flush passes: one for the read to resolve, one for
  // the resulting parse-result state update to render.
  await flush(el);
  await flush(el);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("<email-automation-widget> (dashboard mode)", () => {
  it("renders the placeholder and never calls the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const el = mount({ mode: "dashboard" });
    await el.updateComplete;

    expect(text(el)).toContain("Email Automation Widget");
    expect(text(el)).toContain(
      "Dashboard content coming in a later milestone."
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to dashboard mode when no mode attribute is given", async () => {
    const el = mount();
    await el.updateComplete;
    expect(text(el)).toContain(
      "Dashboard content coming in a later milestone."
    );
  });

  it("applies the resolved theme as CSS custom properties on the host element", async () => {
    const el = mount({ theme: JSON.stringify({ primary: "#654321" }) });
    await el.updateComplete;
    expect(el.style.getPropertyValue("--eaw-color-primary")).toBe("#654321");
  });

  it("falls back to no theme override when the theme attribute is invalid JSON", async () => {
    const el = mount({ theme: "{not valid json" });
    await el.updateComplete;
    // Falls back to the default theme rather than throwing.
    expect(el.style.getPropertyValue("--eaw-color-primary")).toBe("#4F46E5");
  });
});

describe("<email-automation-widget> (mailbox mode)", () => {
  it("shows a loading state while the mailbox request is in flight", async () => {
    mockFetchPending();
    const el = mount({ mode: "mailbox" });
    // The very first render (before Lit's first `updated()` pass fires
    // loadMailbox()) still reflects the initial `loading = false`
    // default, so wait one microtask turn for that pass to run before
    // asserting on the loading state.
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(text(el)).toContain("Loading mailbox…");
  });

  it("renders the mailbox list once the request resolves", async () => {
    mockFetchOnce(200, {
      items: [{ id: "m1", subject: "Welcome", from: "team@example.com" }],
      total: 1,
    });
    const el = mount({ mode: "mailbox", "base-url": "/api" });
    await el.updateComplete;
    // The mailbox() call happens after connectedCallback fires; wait a
    // microtask turn for the fetch promise to settle, then for the
    // resulting state update to flush.
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(text(el)).toContain("Welcome");
    expect(text(el)).toContain("team@example.com");
  });

  it('shows "No messages yet." when the mailbox is empty', async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    const el = mount({ mode: "mailbox" });
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(text(el)).toContain("No messages yet.");
  });

  it("shows an error message and dispatches eaw-error when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const el = mount({ mode: "mailbox" });
    const onError = vi.fn();
    el.addEventListener("eaw-error", onError);

    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    // FIXED: connectedCallback() no longer duplicates the explicit
    // loadMailbox() call that updated() already makes on first render,
    // so this now fires exactly once per failure.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(text(el)).toContain("API request failed with status 500");
  });

  it("sends a Bearer Authorization header built from the token attribute", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    mount({ mode: "mailbox", "base-url": "/api", token: "secret-123" });
    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-123"
    );
  });
});

describe("<email-automation-widget> (composer mode)", () => {
  it("shows validation errors and never calls the network when submitted empty", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const el = mount({ mode: "composer" });
    await el.updateComplete;
    await clickButton(el, /send/i);

    expect(text(el)).toContain("Recipient is required");
    expect(text(el)).toContain("Subject is required");
    expect(text(el)).toContain("Message body is required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears a field error live once the user fixes it", async () => {
    const el = mount({ mode: "composer" });
    await el.updateComplete;

    await clickButton(el, /send/i);
    expect(text(el)).toContain("Subject is required");

    await setValue(el, "eaw-compose-subject", "x");
    expect(text(el)).not.toContain("Subject is required");
  });

  it("sends the email and shows a success message on submit", async () => {
    mockFetchOnce(200, { id: "e1", to: "user@example.com" });
    const el = mount({ mode: "composer" });
    await el.updateComplete;

    const onEmailSent = vi.fn();
    el.addEventListener("eaw-email-sent", onEmailSent);

    await setValue(el, "eaw-compose-to", "user@example.com");
    await setValue(el, "eaw-compose-subject", "Hello");
    await setValue(el, "eaw-compose-body", "Test message");
    await clickButton(el, /send/i);
    await flush(el);

    expect(text(el)).toContain("Sent to user@example.com.");
    expect(onEmailSent).toHaveBeenCalledTimes(1);
  });

  it("shows an error message and dispatches eaw-error when sending fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const el = mount({ mode: "composer" });
    await el.updateComplete;

    const onError = vi.fn();
    el.addEventListener("eaw-error", onError);

    await setValue(el, "eaw-compose-to", "user@example.com");
    await setValue(el, "eaw-compose-subject", "Hello");
    await setValue(el, "eaw-compose-body", "Test message");
    await clickButton(el, /send/i);
    await flush(el);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(text(el)).toContain("API request failed with status 500");
  });
});

describe("<email-automation-widget> (bulk mode — paste recipients)", () => {
  it("counts valid recipients live and dedupes case-insensitively", async () => {
    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    await setValue(el, "eaw-bulk-recipients", "a@x.com, b@x.com");
    expect(text(el)).toContain("2 valid recipients");

    await setValue(el, "eaw-bulk-recipients", "a@x.com, A@X.com");
    expect(text(el)).toContain("1 valid recipient");
  });

  it("warns about invalid entries without blocking the valid ones", async () => {
    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    await setValue(el, "eaw-bulk-recipients", "a@x.com, not-an-email");
    expect(text(el)).toContain("1 valid recipient");
    expect(text(el)).toContain("Ignoring 1 invalid address: not-an-email");
  });

  it("blocks submit with a validation error when there are no recipients", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const el = mount({ mode: "bulk" });
    await el.updateComplete;
    await clickButton(el, /send to all/i);

    expect(text(el)).toContain("Add at least one valid recipient");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the batch, shows progress, and reports the result", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    const onBulkSent = vi.fn();
    el.addEventListener("eaw-bulk-sent", onBulkSent);

    await setValue(el, "eaw-bulk-recipients", "a@x.com, b@x.com");
    await setValue(el, "eaw-bulk-subject", "Hello");
    await setValue(el, "eaw-bulk-body", "Test message");
    await clickButton(el, /send to all/i);
    await flush(el);

    expect(text(el)).toContain("Sent 2, failed 0.");
    expect(onBulkSent).toHaveBeenCalledTimes(1);
  });

  it("shows a bulk error message and dispatches eaw-error when the batch send fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    const onError = vi.fn();
    el.addEventListener("eaw-error", onError);

    await setValue(el, "eaw-bulk-recipients", "a@x.com");
    await setValue(el, "eaw-bulk-subject", "Hello");
    await setValue(el, "eaw-bulk-body", "Test message");
    await clickButton(el, /send to all/i);
    await flush(el);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(text(el)).toContain("API request failed with status 500");
  });

  it("resets the form and recipient source after a successful send", async () => {
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });
    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    await setValue(el, "eaw-bulk-recipients", "a@x.com");
    await setValue(el, "eaw-bulk-subject", "Hello");
    await setValue(el, "eaw-bulk-body", "Test message");
    await clickButton(el, /send to all/i);
    await flush(el);

    expect(text(el)).toContain("Sent 1, failed 0.");
    expect(
      (getField(el, "eaw-bulk-recipients") as HTMLTextAreaElement).value
    ).toBe("");
    expect((getField(el, "eaw-bulk-subject") as HTMLInputElement).value).toBe(
      ""
    );
  });
});

describe("<email-automation-widget> (bulk mode — CSV recipients)", () => {
  it("switches to the CSV tab and shows the upload input", async () => {
    const el = mount({ mode: "bulk" });
    await el.updateComplete;

    await clickButton(el, "Upload CSV");
    expect(el.shadowRoot!.querySelector("#eaw-bulk-csv")).not.toBeNull();
  });

  it("parses a CSV file, counts recipients, and surfaces detected columns", async () => {
    const el = mount({ mode: "bulk" });
    await el.updateComplete;
    await clickButton(el, "Upload CSV");

    const file = csvFile("email,name\na@x.com,Alice\nb@x.com,Bob");
    await setCsvFile(el, "eaw-bulk-csv", file);

    expect(text(el)).toContain("2 valid recipients");
    expect(text(el)).toContain("Loaded:");
    expect(text(el)).toContain("recipients.csv");
    expect(text(el)).toContain("columns: email, name");
  });

  it("shows a clear error when the CSV has no email column", async () => {
    const el = mount({ mode: "bulk" });
    await el.updateComplete;
    await clickButton(el, "Upload CSV");

    const file = csvFile("name,company\nAlice,Acme");
    await setCsvFile(el, "eaw-bulk-csv", file);

    expect(text(el)).toContain('No "email" column found');
  });

  it("sends the parsed CSV recipients on submit", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const el = mount({ mode: "bulk" });
    await el.updateComplete;
    await clickButton(el, "Upload CSV");

    const file = csvFile("email,name\na@x.com,Alice\nb@x.com,Bob");
    await setCsvFile(el, "eaw-bulk-csv", file);
    expect(text(el)).toContain("2 valid recipients");

    await setValue(el, "eaw-bulk-subject", "Hello");
    await setValue(el, "eaw-bulk-body", "Test message");
    await clickButton(el, /send to all/i);
    await flush(el);

    expect(text(el)).toContain("Sent 2, failed 0.");
  });
});
