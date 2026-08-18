/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/vue";
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

function makeCsvFile(content: string, name = "recipients.csv") {
  return new File([content], name, { type: "text/csv" });
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

describe("EmailAutomationWidget (composer mode)", () => {
  it("renders empty to/cc/bcc/subject/body fields with no validation errors shown initially", () => {
    render(EmailAutomationWidget, { props: { mode: "composer" } });
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(screen.queryByText("Recipient is required")).not.toBeInTheDocument();
  });

  it("shows field-level validation errors after the user edits and leaves fields empty, without calling the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(EmailAutomationWidget, { props: { mode: "composer" } });
    const subjectInput = screen.getByLabelText("Subject");
    await fireEvent.update(subjectInput, "x");
    await fireEvent.update(subjectInput, "");

    expect(await screen.findByText("Subject is required")).toBeInTheDocument();
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

  it("submits a valid form, emits email-sent, shows a success message, and resets the form", async () => {
    mockFetchOnce(200, {
      id: "log_1",
      to: "user@example.com",
      subject: "Hello",
      status: "sent",
      sentAt: new Date().toISOString(),
    });
    const onEmailSent = vi.fn();

    render(EmailAutomationWidget, {
      props: { mode: "composer", baseUrl: "/api", onEmailSent },
    });

    await fireEvent.update(screen.getByLabelText("To"), "user@example.com");
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

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

    render(EmailAutomationWidget, {
      props: { mode: "composer", onError },
    });
    await fireEvent.update(screen.getByLabelText("To"), "user@example.com");
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
    await fireEvent.click(screen.getByRole("button", { name: /send/i }));

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

describe("EmailAutomationWidget (bulk mode)", () => {
  it("shows 0 valid recipients and no errors initially", () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    expect(screen.getByText("0 valid recipients")).toBeInTheDocument();
    expect(
      screen.queryByText(/Add at least one valid recipient/)
    ).not.toBeInTheDocument();
  });

  it("updates the live recipient count as the textarea is edited", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    const textarea = screen.getByLabelText("Recipients");
    await fireEvent.update(textarea, "a@x.com, b@x.com");
    expect(await screen.findByText("2 valid recipients")).toBeInTheDocument();
  });

  it("dedupes the same address case-insensitively", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    const textarea = screen.getByLabelText("Recipients");
    await fireEvent.update(textarea, "a@x.com, A@X.com");
    expect(await screen.findByText("1 valid recipient")).toBeInTheDocument();
  });

  it("warns about invalid entries without blocking the valid ones", async () => {
    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    const textarea = screen.getByLabelText("Recipients");
    await fireEvent.update(textarea, "a@x.com, not-an-email");
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

    expect(
      await screen.findByText("Add at least one valid recipient")
    ).toBeInTheDocument();
    expect(screen.getByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Message body is required")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits, shows sent/failed counts, calls onBulkSent, and resets the form on a fully successful batch", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const onBulkSent = vi.fn();

    render(EmailAutomationWidget, {
      props: { mode: "bulk", baseUrl: "/api", onBulkSent },
    });
    await fireEvent.update(
      screen.getByLabelText("Recipients"),
      "a@x.com, b@x.com"
    );
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(await screen.findByText("Sent 2, failed 0.")).toBeInTheDocument();
    expect(onBulkSent).toHaveBeenCalledTimes(1);
    expect(onBulkSent.mock.calls[0][0]).toEqual({
      sentCount: 2,
      failedCount: 0,
      errors: [],
    });
    expect(screen.getByLabelText("Recipients")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
  });

  it("shows a per-recipient error list for a partially-failed batch", async () => {
    mockFetchOnce(200, {
      sentCount: 1,
      failedCount: 1,
      errors: [{ email: "b@x.com", error: "bounced" }],
    });

    render(EmailAutomationWidget, { props: { mode: "bulk" } });
    await fireEvent.update(
      screen.getByLabelText("Recipients"),
      "a@x.com, b@x.com"
    );
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(await screen.findByText("Sent 1, failed 1.")).toBeInTheDocument();
    expect(screen.getByText("b@x.com: bounced")).toBeInTheDocument();
  });

  it("shows a server error and does not reset the form when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server exploded" }),
      text: async () => "Server exploded",
    }) as unknown as typeof fetch;
    const onError = vi.fn();

    render(EmailAutomationWidget, {
      props: { mode: "bulk", onError },
    });
    await fireEvent.update(screen.getByLabelText("Recipients"), "a@x.com");
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
    await fireEvent.click(screen.getByRole("button", { name: /send to all/i }));

    expect(
      await screen.findByText(/API request failed with status 500/)
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Recipients")).toHaveValue("a@x.com");
  });

  it("passes cc/bcc as batch-level fields, not per-recipient", async () => {
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });

    render(EmailAutomationWidget, { props: { mode: "bulk", baseUrl: "/api" } });
    await fireEvent.update(screen.getByLabelText("Recipients"), "a@x.com");
    await fireEvent.update(
      screen.getByLabelText("CC (applies once to the whole batch)"),
      "manager@x.com"
    );
    await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
    await fireEvent.update(screen.getByLabelText("Message"), "Test message");
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
        props: { mode: "bulk", baseUrl: "/api" },
      });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));

      const csv = "email,name\nalice@x.com,Alice\nbob@x.com,Bob";
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile(csv)] },
      });
      await screen.findByText("2 valid recipients");

      await fireEvent.update(screen.getByLabelText("Subject"), "Hi {{name}}");
      await fireEvent.update(
        screen.getByLabelText("Message"),
        "Welcome, {{name}}!"
      );
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
        props: { mode: "bulk", baseUrl: "/api" },
      });
      await fireEvent.click(screen.getByRole("tab", { name: "Upload CSV" }));
      await fireEvent.change(screen.getByLabelText("CSV file"), {
        target: { files: [makeCsvFile("email\na@x.com")] },
      });
      await screen.findByText("1 valid recipient");

      await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
      await fireEvent.update(screen.getByLabelText("Message"), "Test message");
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
      await fireEvent.update(screen.getByLabelText("Subject"), "Hello");
      await fireEvent.update(screen.getByLabelText("Message"), "Test message");
      await fireEvent.click(
        screen.getByRole("button", { name: /send to all/i })
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
