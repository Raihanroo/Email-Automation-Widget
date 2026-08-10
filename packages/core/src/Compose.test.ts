import { describe, it, expect, vi } from "vitest";
import {
  emptyComposeForm,
  validateComposeForm,
  isComposeFormValid,
  composeFormToPayload,
  submitComposeForm,
} from "./Compose";
import type { EmailAdapter, EmailPayload, EmailLogEntry } from "./types";

function mockAdapter(overrides: Partial<EmailAdapter> = {}): EmailAdapter {
  const notUsed = () => {
    throw new Error("not used in this test");
  };
  return {
    sendEmail: notUsed,
    sendBulk: notUsed,
    mailbox: notUsed,
    logs: notUsed,
    templates: notUsed,
    analytics: notUsed,
    ...overrides,
  };
}

describe("emptyComposeForm", () => {
  it("returns all-blank fields", () => {
    const form = emptyComposeForm();
    expect(form).toEqual({ to: "", cc: "", bcc: "", subject: "", body: "" });
  });
});

describe("validateComposeForm", () => {
  it("flags all three required fields when empty", () => {
    const errors = validateComposeForm(emptyComposeForm());
    expect(errors.to).toBe("Recipient is required");
    expect(errors.subject).toBe("Subject is required");
    expect(errors.body).toBe("Message body is required");
    expect(isComposeFormValid(errors)).toBe(false);
  });

  it("flags an invalid email format", () => {
    const errors = validateComposeForm({
      to: "not-an-email",
      cc: "",
      bcc: "",
      subject: "Hi",
      body: "Hello",
    });
    expect(errors.to).toBe("Enter a valid email address");
  });

  it("passes with zero errors for a fully valid form", () => {
    const errors = validateComposeForm({
      to: "user@example.com",
      cc: "",
      bcc: "",
      subject: "Hello",
      body: "Test message",
    });
    expect(isComposeFormValid(errors)).toBe(true);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe("composeFormToPayload", () => {
  it("trims fields and parses comma-separated CC into a list", () => {
    const payload = composeFormToPayload({
      to: "  user@example.com  ",
      cc: "a@x.com, b@x.com ,, c@x.com",
      bcc: "",
      subject: "  Subject  ",
      body: "Body text",
    });

    expect(payload.to).toBe("user@example.com");
    expect(payload.subject).toBe("Subject");
    expect(payload.cc).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(payload.bcc).toBeUndefined();
  });
});

describe("submitComposeForm", () => {
  it("rejects an invalid form without ever calling the adapter", async () => {
    const sendEmail = vi.fn();
    const adapter = mockAdapter({ sendEmail });

    await expect(
      submitComposeForm(adapter, emptyComposeForm())
    ).rejects.toThrow("Recipient is required");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the built payload and returns the adapter's result for a valid form", async () => {
    const sendEmail = vi.fn(
      async (p: EmailPayload): Promise<EmailLogEntry> => ({
        id: "log_123",
        to: p.to,
        subject: p.subject,
        status: "sent",
        sentAt: new Date().toISOString(),
      })
    );
    const adapter = mockAdapter({ sendEmail });

    const result = await submitComposeForm(adapter, {
      to: "user@example.com",
      cc: "",
      bcc: "",
      subject: "Hello",
      body: "Test message",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", subject: "Hello" })
    );
    expect(result.id).toBe("log_123");
    expect(result.status).toBe("sent");
  });
});
