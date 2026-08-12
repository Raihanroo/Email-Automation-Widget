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

    expect(el.shadowRoot!.textContent).toContain("Email Automation Widget");
    expect(el.shadowRoot!.textContent).toContain(
      "Dashboard content coming in a later milestone."
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to dashboard mode when no mode attribute is given", async () => {
    const el = mount();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain(
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
    expect(el.shadowRoot!.textContent).toContain("Loading mailbox…");
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

    expect(el.shadowRoot!.textContent).toContain("Welcome");
    expect(el.shadowRoot!.textContent).toContain("team@example.com");
  });

  it('shows "No messages yet." when the mailbox is empty', async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    const el = mount({ mode: "mailbox" });
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("No messages yet.");
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
    expect(el.shadowRoot!.textContent).toContain(
      "API request failed with status 500"
    );
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
