import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("EmailAutomationWidget (composer mode)", () => {
  it("renders empty to/cc/bcc/subject/body fields with no validation errors shown initially", () => {
    render(<EmailAutomationWidget mode="composer" />);
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(screen.queryByText("Recipient is required")).not.toBeInTheDocument();
  });

  it("shows field-level validation errors after the user edits and leaves fields empty, without calling the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<EmailAutomationWidget mode="composer" />);
    const subjectInput = screen.getByLabelText("Subject");
    await userEvent.type(subjectInput, "x");
    await userEvent.clear(subjectInput);

    expect(await screen.findByText("Subject is required")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks submit and shows errors for a fully empty form", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<EmailAutomationWidget mode="composer" />);
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText("Recipient is required")
    ).toBeInTheDocument();
    expect(screen.getByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Message body is required")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits a valid form, calls onEmailSent, shows a success message, and resets the form", async () => {
    mockFetchOnce(200, {
      id: "log_1",
      to: "user@example.com",
      subject: "Hello",
      status: "sent",
      sentAt: new Date().toISOString(),
    });
    const onEmailSent = vi.fn();

    render(
      <EmailAutomationWidget
        mode="composer"
        baseURL="/api"
        onEmailSent={onEmailSent}
      />
    );

    await userEvent.type(screen.getByLabelText("To"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Subject"), "Hello");
    await userEvent.type(screen.getByLabelText("Message"), "Test message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText(/Sent to user@example.com/)
    ).toBeInTheDocument();
    expect(onEmailSent).toHaveBeenCalledTimes(1);
    expect(onEmailSent.mock.calls[0][0]).toMatchObject({
      id: "log_1",
      status: "sent",
    });
    // Form resets after a successful send.
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
  });

  it("shows a server error message and calls onError without resetting the form when the send fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;
    const onError = vi.fn();

    render(<EmailAutomationWidget mode="composer" onError={onError} />);
    await userEvent.type(screen.getByLabelText("To"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Subject"), "Hello");
    await userEvent.type(screen.getByLabelText("Message"), "Test message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    // Form is NOT reset after a failed send, so the user doesn't lose their draft.
    expect(screen.getByLabelText("To")).toHaveValue("user@example.com");
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

describe("EmailAutomationWidget (bulk-composer mode)", () => {
  it("parses a pasted recipient list live and shows the valid count", async () => {
    const user = userEvent.setup();
    render(<EmailAutomationWidget mode="bulk-composer" />);

    await user.type(
      screen.getByPlaceholderText(/jane@example.com/),
      "jane@example.com, not-an-email, john@example.com"
    );

    expect(
      await screen.findByText(/2 valid recipients ready/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Skipped 1 invalid address: not-an-email/)
    ).toBeInTheDocument();
  });

  it("parses an uploaded CSV, surfaces detected columns, and offers placeholder chips", async () => {
    const user = userEvent.setup();
    render(<EmailAutomationWidget mode="bulk-composer" />);

    await user.click(screen.getByRole("button", { name: "Upload CSV" }));

    const csv =
      "Email,firstName,company\njane@example.com,Jane,Acme\njohn@example.com,John,Globex\n";
    const file = new File([csv], "recipients.csv", { type: "text/csv" });
    const input = document.getElementById("eaw-bulk-csv") as HTMLInputElement;
    await user.upload(input, file);

    expect(
      await screen.findByText(
        /recipients.csv — 2 recipients found · columns: firstName, company/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ {{firstName}}" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ {{company}}" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ {{firstName}}" }));
    expect(screen.getByLabelText("Message")).toHaveValue("{{firstName}}");
  });

  it("shows a clear error when the uploaded CSV has no Email column", async () => {
    const user = userEvent.setup();
    render(<EmailAutomationWidget mode="bulk-composer" />);

    await user.click(screen.getByRole("button", { name: "Upload CSV" }));
    const file = new File(["firstName\nJane\n"], "no-email.csv", {
      type: "text/csv",
    });
    const input = document.getElementById("eaw-bulk-csv") as HTMLInputElement;
    await user.upload(input, file);

    expect(
      await screen.findByText(/No "Email" column found in this CSV/)
    ).toBeInTheDocument();
  });

  it("switching between paste and CSV clears whatever the other method had parsed", async () => {
    const user = userEvent.setup();
    render(<EmailAutomationWidget mode="bulk-composer" />);

    await user.type(
      screen.getByPlaceholderText(/jane@example.com/),
      "jane@example.com"
    );
    expect(
      await screen.findByText(/1 valid recipient ready/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload CSV" }));
    expect(screen.queryByText(/recipients? ready/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Paste list" }));
    expect(screen.getByPlaceholderText(/jane@example.com/)).toHaveValue("");
  });

  it("submits the bulk form and reports the send result", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const user = userEvent.setup();
    const onBulkSent = vi.fn();
    render(
      <EmailAutomationWidget
        mode="bulk-composer"
        baseURL="/api"
        onBulkSent={onBulkSent}
      />
    );

    await user.type(
      screen.getByPlaceholderText(/jane@example.com/),
      "jane@example.com, john@example.com"
    );
    await user.type(screen.getByLabelText("Subject"), "Hello");
    await user.type(screen.getByLabelText("Message"), "Hi there");
    await user.click(
      screen.getByRole("button", { name: /Send to 2 recipients/ })
    );

    await waitFor(() => expect(onBulkSent).toHaveBeenCalledTimes(1));
    expect(onBulkSent).toHaveBeenCalledWith({
      sentCount: 2,
      failedCount: 0,
      errors: [],
    });
    expect(await screen.findByText("Sent 2 of 2.")).toBeInTheDocument();
    // Form resets after a successful send.
    expect(screen.getByPlaceholderText(/jane@example.com/)).toHaveValue("");
  });

  it("blocks submit and shows a field error when there are no valid recipients", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<EmailAutomationWidget mode="bulk-composer" />);
    await user.type(screen.getByLabelText("Subject"), "Hello");
    await user.type(screen.getByLabelText("Message"), "Hi there");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Add at least one valid recipient")
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
