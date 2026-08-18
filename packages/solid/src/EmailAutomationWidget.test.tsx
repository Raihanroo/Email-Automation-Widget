import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import { EmailAutomationWidget } from "./EmailAutomationWidget";

/**
 * These tests exercise the real component tree (no shallow rendering)
 * through Solid Testing Library. The wrapper builds its own ApiClient
 * internally (it does not accept an injected adapter), so the only seam
 * available for mocking network behaviour is `global.fetch`.
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
      props: { theme: { primary: "#0f0f0f" } },
    });
    const root = container.querySelector(".eaw-root") as HTMLElement;
    expect(root.style.getPropertyValue("--eaw-color-primary")).toBe("#0f0f0f");
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

describe("EmailAutomationWidget (composer mode)", () => {
  it("shows validation errors and never calls the network when submitted empty", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "composer" } });
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText("Recipient is required")
    ).toBeInTheDocument();
    expect(screen.getByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Message body is required")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears a field error live once the user fixes it", async () => {
    render(EmailAutomationWidget, { props: { mode: "composer" } });
    const subjectInput = screen.getByLabelText("Subject");

    await fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Subject is required")).toBeInTheDocument();

    await fireEvent.input(subjectInput, { target: { value: "x" } });
    await waitFor(() =>
      expect(screen.queryByText("Subject is required")).not.toBeInTheDocument()
    );
  });

  it("sends the email and shows a success message on submit", async () => {
    mockFetchOnce(200, { id: "e1", to: "user@example.com" });
    const onEmailSent = vi.fn();

    render(EmailAutomationWidget, { props: { mode: "composer", onEmailSent } });
    await fireEvent.input(screen.getByLabelText("To"), {
      target: { value: "user@example.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText("Sent to user@example.com.")
    ).toBeInTheDocument();
    expect(onEmailSent).toHaveBeenCalledTimes(1);
  });

  it("shows an error message and calls onError when sending fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;
    const onError = vi.fn();

    render(EmailAutomationWidget, { props: { mode: "composer", onError } });
    await fireEvent.input(screen.getByLabelText("To"), {
      target: { value: "user@example.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
  });
});

describe("EmailAutomationWidget (bulk mode — paste recipients)", () => {
  it("counts valid recipients live and dedupes case-insensitively", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    const textarea = screen.getByLabelText("Recipients");

    await fireEvent.input(textarea, { target: { value: "a@x.com, b@x.com" } });
    expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();

    await fireEvent.input(textarea, { target: { value: "a@x.com, A@X.com" } });
    expect(await screen.findByText("1 valid recipient")).toBeInTheDocument();
  });

  it("warns about invalid entries without blocking the valid ones", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    const textarea = screen.getByLabelText("Recipients");

    await fireEvent.input(textarea, {
      target: { value: "a@x.com, not-an-email" },
    });
    expect(await screen.findByText("1 valid recipient")).toBeInTheDocument();
    expect(
      screen.getByText(/Ignoring 1 invalid address: not-an-email/)
    ).toBeInTheDocument();
  });

  it("blocks submit with a validation error when there are no recipients", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(
      await screen.findByText("Add at least one valid recipient")
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the batch, shows progress, and reports the result", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const onBulkSent = vi.fn();

    render(EmailAutomationWidget, { props: { mode: "bulk", onBulkSent } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com, b@x.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(await screen.findByText("Sent 2, failed 0.")).toBeInTheDocument();
    expect(onBulkSent).toHaveBeenCalledTimes(1);
  });

  it("shows a bulk error message and calls onError when the batch send fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;
    const onError = vi.fn();

    render(EmailAutomationWidget, { props: { mode: "bulk", onError } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
  });

  it("resets the form and recipient source after a successful send", async () => {
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    await screen.findByText("Sent 1, failed 0.");
    expect(
      (screen.getByLabelText("Recipients") as HTMLTextAreaElement).value
    ).toBe("");
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      ""
    );
  });
});

describe("EmailAutomationWidget (bulk mode — CSV recipients)", () => {
  function csvFile(contents: string, name = "recipients.csv") {
    return new File([contents], name, { type: "text/csv" });
  }

  it("switches to the CSV tab and shows the upload input", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));
    expect(screen.getByLabelText("CSV file")).toBeInTheDocument();
  });

  it("parses a CSV file, counts recipients, and surfaces detected columns", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

    const file = csvFile("email,name\na@x.com,Alice\nb@x.com,Bob");
    await fireEvent.change(screen.getByLabelText("CSV file"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();
    expect(screen.getByText(/Loaded: recipients.csv/)).toBeInTheDocument();
    expect(screen.getByText(/columns: email, name/)).toBeInTheDocument();
  });

  it("shows a clear error when the CSV has no email column", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

    const file = csvFile("name,company\nAlice,Acme");
    await fireEvent.change(screen.getByLabelText("CSV file"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(/No "email" column found/)
    ).toBeInTheDocument();
  });

  it("sends the parsed CSV recipients on submit", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

    const file = csvFile("email,name\na@x.com,Alice\nb@x.com,Bob");
    await fireEvent.change(screen.getByLabelText("CSV file"), {
      target: { files: [file] },
    });
    await screen.findByText("2 valid recipients");

    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(await screen.findByText("Sent 2, failed 0.")).toBeInTheDocument();
  });
});
