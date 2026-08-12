import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
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

    render(<EmailAutomationWidget mode="dashboard" />);

    expect(screen.getByText("Email Automation Widget")).toBeInTheDocument();
    expect(
      screen.getByText("Dashboard content coming in a later milestone.")
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("applies the resolved theme as CSS custom properties on the root element", () => {
    const { container } = render(
      <EmailAutomationWidget theme={{ primary: "#00ff00" }} />
    );
    const root = container.querySelector(".eaw-root") as HTMLElement;
    expect(root.style.getPropertyValue("--eaw-color-primary")).toBe("#00ff00");
  });

  it("reflects the layout prop as a data attribute", () => {
    const { container } = render(<EmailAutomationWidget layout="embedded" />);
    expect(container.querySelector(".eaw-root")).toHaveAttribute(
      "data-layout",
      "embedded"
    );
  });
});

describe("EmailAutomationWidget (mailbox mode)", () => {
  it("shows a loading state while the mailbox request is in flight", async () => {
    mockFetchPending();
    render(<EmailAutomationWidget mode="mailbox" />);
    expect(await screen.findByText("Loading mailbox…")).toBeInTheDocument();
  });

  it("renders the mailbox list once the request resolves", async () => {
    mockFetchOnce(200, {
      items: [{ id: "m1", subject: "Welcome", from: "team@example.com" }],
      total: 1,
    });
    render(<EmailAutomationWidget mode="mailbox" baseURL="/api" />);
    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText(/— team@example.com/)).toBeInTheDocument();
  });

  it('shows "No messages yet." when the mailbox is empty', async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(<EmailAutomationWidget mode="mailbox" />);
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
    render(<EmailAutomationWidget mode="mailbox" onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
  });

  it("sends a Bearer Authorization header built from the token prop", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(
      <EmailAutomationWidget mode="mailbox" baseURL="/api" token="secret-123" />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-123"
    );
  });
});
