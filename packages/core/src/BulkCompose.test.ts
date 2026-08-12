import { describe, it, expect, vi } from "vitest";
import {
  emptyBulkComposeForm,
  parseRecipients,
  parseRecipientsFromCsv,
  validateBulkComposeForm,
  isBulkComposeFormValid,
  bulkComposeFormToPayload,
  submitBulkComposeForm,
} from "./BulkCompose";
import type { EmailAdapter, BulkEmailPayload, BulkSendResult } from "./types";

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

describe("emptyBulkComposeForm", () => {
  it("returns all-blank fields", () => {
    expect(emptyBulkComposeForm()).toEqual({
      recipientsRaw: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
    });
  });
});

describe("parseRecipients", () => {
  it("splits on commas and newlines, trims, and dedupes case-insensitively", () => {
    const { recipients, invalidEntries } = parseRecipients(
      "a@x.com, B@x.com\nc@x.com,, a@x.com\nb@x.com"
    );
    expect(recipients).toEqual([
      { email: "a@x.com" },
      { email: "B@x.com" },
      { email: "c@x.com" },
    ]);
    expect(invalidEntries).toHaveLength(0);
  });

  it("collects malformed entries as invalidEntries instead of dropping them silently", () => {
    const { recipients, invalidEntries } = parseRecipients(
      "good@x.com, not-an-email, also bad"
    );
    expect(recipients).toEqual([{ email: "good@x.com" }]);
    expect(invalidEntries).toEqual(["not-an-email", "also bad"]);
  });

  it("returns empty results for blank input", () => {
    expect(parseRecipients("   \n  ")).toEqual({
      recipients: [],
      invalidEntries: [],
    });
  });
});

describe("parseRecipientsFromCsv", () => {
  it("maps the email column and turns other columns into placeholderData", () => {
    const csv = [
      "email,firstName,company",
      "jane@x.com,Jane,Acme",
      "john@x.com,John,Globex",
    ].join("\n");

    const result = parseRecipientsFromCsv(csv);

    expect(result.missingEmailColumn).toBe(false);
    expect(result.headers).toEqual(["email", "firstName", "company"]);
    expect(result.recipients).toEqual([
      {
        email: "jane@x.com",
        placeholderData: { firstName: "Jane", company: "Acme" },
      },
      {
        email: "john@x.com",
        placeholderData: { firstName: "John", company: "Globex" },
      },
    ]);
  });

  it("matches the email header case-insensitively and accepts 'Email Address'", () => {
    const csv = ["Email Address,Name", "a@x.com,A"].join("\n");
    const result = parseRecipientsFromCsv(csv);
    expect(result.missingEmailColumn).toBe(false);
    expect(result.recipients).toEqual([
      { email: "a@x.com", placeholderData: { Name: "A" } },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = ["email,company", '"jane@x.com","Acme, Inc."'].join("\n");
    const result = parseRecipientsFromCsv(csv);
    expect(result.recipients).toEqual([
      { email: "jane@x.com", placeholderData: { company: "Acme, Inc." } },
    ]);
  });

  it("flags missingEmailColumn when no email-like header exists", () => {
    const csv = ["name,company", "Jane,Acme"].join("\n");
    const result = parseRecipientsFromCsv(csv);
    expect(result.missingEmailColumn).toBe(true);
    expect(result.recipients).toHaveLength(0);
  });

  it("skips invalid emails and reports them, and de-duplicates valid ones", () => {
    const csv = ["email,name", "bad-email,X", "a@x.com,A", "a@x.com,A2"].join(
      "\n"
    );
    const result = parseRecipientsFromCsv(csv);
    expect(result.invalidEntries).toEqual(["bad-email"]);
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].email).toBe("a@x.com");
  });
});

describe("validateBulkComposeForm", () => {
  it("flags empty recipients, subject, and body", () => {
    const errors = validateBulkComposeForm(emptyBulkComposeForm(), []);
    expect(errors.recipients).toBe("Add at least one valid recipient");
    expect(errors.subject).toBe("Subject is required");
    expect(errors.body).toBe("Message body is required");
    expect(isBulkComposeFormValid(errors)).toBe(false);
  });

  it("passes with zero errors for a fully valid form", () => {
    const errors = validateBulkComposeForm(
      {
        recipientsRaw: "a@x.com",
        cc: "",
        bcc: "",
        subject: "Hi",
        body: "Hello",
      },
      [{ email: "a@x.com" }]
    );
    expect(isBulkComposeFormValid(errors)).toBe(true);
  });
});

describe("bulkComposeFormToPayload", () => {
  it("builds a BulkEmailPayload with parsed cc/bcc and the given recipients", () => {
    const payload: BulkEmailPayload = bulkComposeFormToPayload(
      {
        recipientsRaw: "ignored-here",
        cc: "cc@x.com",
        bcc: "",
        subject: "  Subject  ",
        body: "Body",
      },
      [
        { email: "a@x.com" },
        { email: "b@x.com", placeholderData: { name: "B" } },
      ]
    );

    expect(payload.subject).toBe("Subject");
    expect(payload.cc).toEqual(["cc@x.com"]);
    expect(payload.bcc).toBeUndefined();
    expect(payload.recipients).toHaveLength(2);
    expect(payload.recipients[1].placeholderData).toEqual({ name: "B" });
  });
});

describe("submitBulkComposeForm", () => {
  it("rejects when there are no valid recipients, without calling the adapter", async () => {
    const sendBulk = vi.fn();
    const adapter = mockAdapter({ sendBulk });

    await expect(
      submitBulkComposeForm(
        adapter,
        { recipientsRaw: "", cc: "", bcc: "", subject: "Hi", body: "Hello" },
        []
      )
    ).rejects.toThrow("Add at least one valid recipient");
    expect(sendBulk).not.toHaveBeenCalled();
  });

  it("sends the built payload and forwards onProgress to the adapter", async () => {
    const result: BulkSendResult = { sentCount: 2, failedCount: 0, errors: [] };
    const sendBulk = vi.fn(async () => result);
    const adapter = mockAdapter({ sendBulk });
    const onProgress = vi.fn();

    const recipients = [{ email: "a@x.com" }, { email: "b@x.com" }];
    const returned = await submitBulkComposeForm(
      adapter,
      { recipientsRaw: "", cc: "", bcc: "", subject: "Hi", body: "Hello" },
      recipients,
      onProgress
    );

    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(sendBulk).toHaveBeenCalledWith(
      expect.objectContaining({ recipients, subject: "Hi" }),
      onProgress
    );
    expect(returned).toBe(result);
  });
});
