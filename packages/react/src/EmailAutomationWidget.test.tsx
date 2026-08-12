import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EmailAutomationWidget } from "./EmailAutomationWidget";

/**
 * These tests exercise the real component tree (no shallow rendering)
 * through React Testing Library. The wrapper builds its own ApiClient
 * internally (it does not accept an injected adapter — see the note in
 * the PR description), so the only seam available for mocking network
 * behaviour is `global.fetch`.
 */

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

function mockFetchPending() {
  // Never resolves — lets us assert the loading state deterministically.
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

  it("defaults to dashboard mode when no mode prop is given", () => {
    render(<EmailAutomationWidget />);
    expect(
      screen.getByText("Dashboard content coming in a later milestone.")
    ).toBeInTheDocument();
  });

  it("applies the resolved theme as CSS custom properties on the root element", () => {
    const { container } = render(
      <EmailAutomationWidget theme={{ primary: "#ff0000" }} />
    );
    const root = container.querySelector(".eaw-root") as HTMLElement;
    expect(root.style.getPropertyValue("--eaw-color-primary")).toBe("#ff0000");
    // Untouched theme fields fall back to the light-theme defaults.
    expect(root.style.getPropertyValue("--eaw-color-bg")).toBe("#FFFFFF");
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
      items: [
        { id: "m1", subject: "Welcome", from: "team@example.com" },
        { id: "m2", subject: "Invoice #42", from: "billing@example.com" },
      ],
      total: 2,
    });

    render(<EmailAutomationWidget mode="mailbox" baseURL="/api" />);

    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Invoice #42")).toBeInTheDocument();
    expect(screen.getByText(/— team@example.com/)).toBeInTheDocument();
    expect(screen.queryByText("Loading mailbox…")).not.toBeInTheDocument();
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
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
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
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    // ApiClient.get() always appends "?" once a params object is passed,
    // even when every value in it is undefined and gets filtered out.
    expect(url).toBe("/api/emails/mailbox?");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-123"
    );
  });

  it("omits the Authorization header when no token is provided", async () => {
    mockFetchOnce(200, { items: [], total: 0 });
    render(<EmailAutomationWidget mode="mailbox" baseURL="/api" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(
      (init.headers as Record<string, string>)["Authorization"]
    ).toBeUndefined();
  });
});
