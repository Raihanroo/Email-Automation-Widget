import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/svelte";
import EmailAutomationWidget from "./EmailAutomationWidget.svelte";

function makeCsvFile(content: string, name = "recipients.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

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

describe("EmailAutomationWidget (composer mode)", () => {
  it("renders empty to/cc/bcc/subject/body fields with no validation errors shown initially", () => {
    render(EmailAutomationWidget, { props: { mode: "composer" } });
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("CC")).toHaveValue("");
    expect(screen.getByLabelText("BCC")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(screen.queryByText(/is required/)).not.toBeInTheDocument();
  });

  it("shows field-level validation errors after the user edits and leaves fields empty, without calling the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "composer" } });
    await fireEvent.input(screen.getByLabelText("To"), {
      target: { value: "not-an-email" },
    });

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks submit and shows errors for a fully empty form", async () => {
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

  it("submits a valid form, calls onEmailSent, shows a success message, and resets the form", async () => {
    mockFetchOnce(200, {
      id: "log-1",
      to: "jane@example.com",
      subject: "Hi",
      status: "sent",
    });
    const onEmailSent = vi.fn();

    render(EmailAutomationWidget, {
      props: { mode: "composer", onEmailSent },
    });
    await fireEvent.input(screen.getByLabelText("To"), {
      target: { value: "jane@example.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hi" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Hello there" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText("Sent to jane@example.com.")
    ).toBeInTheDocument();
    expect(onEmailSent).toHaveBeenCalledTimes(1);
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

    render(EmailAutomationWidget, {
      props: { mode: "composer", onError },
    });
    await fireEvent.input(screen.getByLabelText("To"), {
      target: { value: "jane@example.com" },
    });
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hi" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Hello there" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("To")).toHaveValue("jane@example.com");
  });
});

describe("EmailAutomationWidget (bulk mode)", () => {
  it("shows 0 valid recipients and no errors initially", () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    expect(screen.getByText("0 valid recipients")).toBeInTheDocument();
  });

  it("updates the live recipient count as the textarea is edited", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com, b@x.com" },
    });
    expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();
  });

  it("dedupes the same address case-insensitively", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com, A@X.COM, b@x.com" },
    });
    expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();
  });

  it("warns about invalid entries without blocking the valid ones", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com, not-an-email" },
    });
    expect(await screen.findByText("1 valid recipient")).toBeInTheDocument();
    expect(
      screen.getByText(/Ignoring 1 invalid address: not-an-email/)
    ).toBeInTheDocument();
  });

  it("blocks submit and shows errors when there are no valid recipients, subject, or body", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Message body is required")).toBeInTheDocument();
  });

  it("submits, shows sent/failed counts, calls onBulkSent, and resets the form on a fully successful batch", async () => {
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
    expect(screen.getByText("0 valid recipients")).toBeInTheDocument();
  });

  it("shows a per-recipient error list for a partially-failed batch", async () => {
    mockFetchOnce(200, {
      sentCount: 1,
      failedCount: 1,
      errors: [{ email: "b@x.com", error: "Bounced" }],
    });

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
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

    expect(await screen.findByText("Sent 1, failed 1.")).toBeInTheDocument();
    expect(screen.getByText(/b@x.com: Bounced/)).toBeInTheDocument();
  });

  it("shows a server error and does not reset the form when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;

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

    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Recipients")).toHaveValue("a@x.com");
  });

  it("passes cc/bcc as batch-level fields, not per-recipient", async () => {
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.input(screen.getByLabelText("Recipients"), {
      target: { value: "a@x.com" },
    });
    await fireEvent.input(
      screen.getByLabelText("CC (applies once to the whole batch)"),
      { target: { value: "manager@x.com" } }
    );
    await fireEvent.input(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await fireEvent.input(screen.getByLabelText("Message"), {
      target: { value: "Test message" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.cc).toEqual(["manager@x.com"]);
    expect(body.recipients).toEqual([{ email: "a@x.com" }]);
  });

  describe("recipient source toggle: paste vs CSV", () => {
    it("defaults to the paste-list tab with the textarea visible and no file input", () => {
      render(EmailAutomationWidget, { props: { mode: "bulk" } });
      expect(screen.getByRole("tab", { name: "Paste list" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.getByLabelText("Recipients")).toBeInTheDocument();
      expect(screen.queryByLabelText("CSV file")).not.toBeInTheDocument();
    });

    it("switches to the CSV file input when the Upload CSV tab is clicked, hiding the textarea", async () => {
      render(EmailAutomationWidget, { props: { mode: "bulk" } });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

      expect(screen.getByRole("tab", { name: "Upload CSV" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.getByLabelText("CSV file")).toBeInTheDocument();
      expect(screen.queryByLabelText("Recipients")).not.toBeInTheDocument();
    });

    it("parses a valid CSV, showing the recipient count and detected columns", async () => {
      render(EmailAutomationWidget, { props: { mode: "bulk" } });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

      const csv = "name,email\nAlice,alice@x.com\nBob,bob@x.com";
      const file = makeCsvFile(csv);
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [file] },
      });

      expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();
      expect(
        screen.getByText(/Loaded: recipients.csv — columns: name, email/)
      ).toBeInTheDocument();
    });

    it("shows a clear error when the CSV has no email column", async () => {
      render(EmailAutomationWidget, { props: { mode: "bulk" } });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

      const csv = "name,phone\nAlice,555-1234";
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile(csv)] },
      });

      expect(
        await screen.findByText(/No "email" column found/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/detected columns: name, phone/)
      ).toBeInTheDocument();
      expect(screen.getByText("0 valid recipients")).toBeInTheDocument();
    });

    it("sends per-recipient placeholderData parsed from CSV columns", async () => {
      mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
      render(EmailAutomationWidget, {
        props: { mode: "bulk", baseURL: "/api" },
      });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

      const csv = "email,name\nalice@x.com,Alice\nbob@x.com,Bob";
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile(csv)] },
      });
      await screen.findByText("2 valid recipients");

      await fireEvent.input(screen.getByLabelText("Subject"), {
        target: { value: "Hi {{name}}" },
      });
      await fireEvent.input(screen.getByLabelText("Message"), {
        target: { value: "Welcome, {{name}}!" },
      });
      await fireEvent.click(
        screen.getByRole("button", { name: /send to all/i })
      );

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.recipients).toEqual([
        { email: "alice@x.com", placeholderData: { name: "Alice" } },
        { email: "bob@x.com", placeholderData: { name: "Bob" } },
      ]);
    });

    it("clears the loaded CSV file after a successful send", async () => {
      mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });
      render(EmailAutomationWidget, {
        props: { mode: "bulk", baseURL: "/api" },
      });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile("email\na@x.com")] },
      });
      await screen.findByText("1 valid recipient");

      await fireEvent.input(screen.getByLabelText("Subject"), {
        target: { value: "Hello" },
      });
      await fireEvent.input(screen.getByLabelText("Message"), {
        target: { value: "Test message" },
      });
      await fireEvent.click(
        screen.getByRole("button", { name: /send to all/i })
      );

      expect(await screen.findByText("Sent 1, failed 0.")).toBeInTheDocument();
      expect(screen.queryByText(/Loaded:/)).not.toBeInTheDocument();
      expect(screen.getByText("0 valid recipients")).toBeInTheDocument();
    });

    it("blocks submit with a validation error when the CSV parse yields zero recipients", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      render(EmailAutomationWidget, { props: { mode: "bulk" } });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile("name\nAlice")] },
      });
      await fireEvent.input(screen.getByLabelText("Subject"), {
        target: { value: "Hello" },
      });
      await fireEvent.input(screen.getByLabelText("Message"), {
        target: { value: "Test message" },
      });
      await fireEvent.click(
        screen.getByRole("button", { name: /send to all/i })
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
