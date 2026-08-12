import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/vue";
import { EmailAutomationWidget } from "./EmailAutomationWidget";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmailAutomationWidget (dashboard mode)", () => {
  it("renders the placeholder and never calls the network", () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "dashboard" } });

    expect(screen.getByText("Email Automation Widget")).toBeInTheDocument();
    expect(
      screen.getByText("Dashboard content coming in a later milestone.")
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to dashboard mode when no mode prop is given", () => {
    render(EmailAutomationWidget);
    expect(
      screen.getByText("Dashboard content coming in a later milestone.")
    ).toBeInTheDocument();
  });

  it("applies the resolved theme as CSS custom properties on the root element", () => {
    const { container } = render(EmailAutomationWidget, {
      props: { theme: { primary: "#abcdef" } },
    });
    const root = container.querySelector(".eaw-root") as HTMLElement;
    expect(root.style.getPropertyValue("--eaw-color-primary")).toBe("#abcdef");
  });

  it("reflects the layout prop as a data attribute", () => {
    const { container } = render(EmailAutomationWidget, {
      props: { layout: "embedded" },
    });
    expect(container.querySelector(".eaw-root")).toHaveAttribute(
      "data-layout",
      "embedded"
    );
  });
});

describe("EmailAutomationWidget (mailbox mode)", () => {
  it("shows a loading state while the mailbox request is in flight", async () => {
    mockFetchPending();
    render(EmailAutomationWidget, { props: { mode: "mailbox" } });
    expect(await screen.findByText("Loading mailbox…")).toBeInTheDocument();
  });

  it("renders the mailbox list once the request resolves", async () => {
    mockFetchOnce(200, {
      items: [{ id: "m1", subject: "Welcome", from: "team@example.com" }],
      total: 1,
    });
    render(EmailAutomationWidget, {
      props: { mode: "mailbox", baseUrl: "/api" },
    });
    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText(/— team@example.com/)).toBeInTheDocument();
  });

  it('shows "No messages yet." when the mailbox is empty', async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(EmailAutomationWidget, { props: { mode: "mailbox" } });
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
  });

  it("shows an error message and notifies error listeners exactly once when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const onError = vi.fn();
    const { emitted } = render(EmailAutomationWidget, {
      props: { mode: "mailbox", onError },
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
    expect(emitted().error).toBeTruthy();

    // FIXED: previously called both `props.onError?.(e)` explicitly and
    // relied on Vue's automatic `onError` prop -> `error` emit wiring,
    // firing the callback twice per failure. Now only the emit fires,
    // and Vue's auto-wiring invokes the callback exactly once.
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("sends a Bearer Authorization header built from the token prop", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(EmailAutomationWidget, {
      props: { mode: "mailbox", baseUrl: "/api", token: "secret-123" },
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-123"
    );
  });

  it("re-fetches the mailbox when the mode prop changes to mailbox after mount", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    const { rerender } = render(EmailAutomationWidget, {
      props: { mode: "dashboard" },
    });
    expect(global.fetch).not.toHaveBeenCalled();

    await rerender({ mode: "mailbox" });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});
