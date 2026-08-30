import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import EmailAutomationWidget from "./EmailAutomationWidget.svelte";

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

function mockFetchByUrl(routes: Record<string, unknown>) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : {};
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmailAutomationWidget (dashboard mode)", () => {
  it("shows a loading state while the dashboard requests are in flight", async () => {
    mockFetchPending();
    render(EmailAutomationWidget, { props: { mode: "dashboard" } });
    expect(await screen.findByText("Loading dashboard…")).toBeInTheDocument();
  });

  it("defaults to dashboard mode when no mode prop is given", async () => {
    mockFetchByUrl({
      analytics: {
        totalSent: 0,
        totalOpened: 0,
        totalFailed: 0,
        openRate: 0,
        bounceRate: 0,
      },
      logs: { items: [], total: 0 },
      mailbox: { items: [], total: 0 },
    });
    render(EmailAutomationWidget);
    expect(await screen.findByText("Total Sent")).toBeInTheDocument();
  });

  it("renders stat cards, recent mailbox, and recent activity once all three requests resolve", async () => {
    mockFetchByUrl({
      analytics: {
        totalSent: 120,
        totalOpened: 80,
        totalFailed: 3,
        openRate: 0.667,
        bounceRate: 0.025,
      },
      logs: {
        items: [
          {
            id: "l1",
            to: "user@example.com",
            subject: "Weekly digest",
            status: "opened",
            sentAt: new Date().toISOString(),
          },
        ],
        total: 1,
      },
      mailbox: {
        items: [{ id: "m1", subject: "Welcome", from: "team@example.com" }],
        total: 1,
      },
    });

    render(EmailAutomationWidget, {
      props: { mode: "dashboard", baseURL: "/api" },
    });

    expect(await screen.findByText("Total Sent")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Weekly digest")).toBeInTheDocument();
    // "Opened" appears twice — once as the stat card label, once as the
    // status badge text — so this must use getAllByText, not getByText.
    expect(screen.getAllByText("Opened").length).toBeGreaterThan(0);
  });

  it('shows "No messages yet." and "No recent activity." when both lists are empty', async () => {
    mockFetchByUrl({
      analytics: {
        totalSent: 0,
        totalOpened: 0,
        totalFailed: 0,
        openRate: 0,
        bounceRate: 0,
      },
      logs: { items: [], total: 0 },
      mailbox: { items: [], total: 0 },
    });

    render(EmailAutomationWidget, { props: { mode: "dashboard" } });

    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
  });

  it("shows an error message and calls onError when a dashboard request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const onError = vi.fn();
    render(EmailAutomationWidget, { props: { mode: "dashboard", onError } });

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
  });

  it("applies the resolved theme as CSS custom properties on the root element", () => {
    mockFetchPending();
    const { container } = render(EmailAutomationWidget, {
      props: { theme: { primary: "#0f0f0f" } },
    });
    const root = container.querySelector(".eaw-root") as HTMLElement;
    expect(root.style.getPropertyValue("--eaw-color-primary")).toBe("#0f0f0f");
  });

  it("reflects the layout prop as a data attribute", () => {
    mockFetchPending();
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
      props: { mode: "mailbox", baseURL: "/api" },
    });
    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText(/— team@example.com/)).toBeInTheDocument();
  });

  it('shows "No messages yet." when the mailbox is empty', async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(EmailAutomationWidget, { props: { mode: "mailbox" } });
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
  });

  it("shows an error message and calls onError when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

    const onError = vi.fn();
    render(EmailAutomationWidget, { props: { mode: "mailbox", onError } });

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
  });

  it("sends a Bearer Authorization header built from the token prop", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(EmailAutomationWidget, {
      props: { mode: "mailbox", baseURL: "/api", token: "secret-123" },
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-123"
    );
  });
});
