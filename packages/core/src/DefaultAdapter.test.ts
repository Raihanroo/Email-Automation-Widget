import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "./ApiClient";
import { createDefaultAdapter } from "./DefaultAdapter";
import type { BulkEmailPayload, BulkSendResult } from "./types";

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAdapter() {
  const client = new ApiClient("/api");
  return createDefaultAdapter(client);
}

const validPayload: BulkEmailPayload = {
  recipients: [{ email: "a@x.com" }, { email: "b@x.com" }],
  subject: "Hello",
  body: "Test message",
};

describe("DefaultAdapter.sendBulk — validation", () => {
  it("rejects an empty recipient list without calling the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const adapter = makeAdapter();

    await expect(
      adapter.sendBulk({ recipients: [], subject: "S", body: "B" })
    ).rejects.toThrow("recipients must contain at least one address");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid recipient email(s) without calling the network, listing every bad address", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const adapter = makeAdapter();

    await expect(
      adapter.sendBulk({
        recipients: [{ email: "ok@x.com" }, { email: "not-an-email" }],
        subject: "S",
        body: "B",
      })
    ).rejects.toThrow(/Invalid recipient email\(s\): not-an-email/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT validate subject/body itself — that's BulkCompose's job, not the adapter's", async () => {
    // This pins current behaviour: unlike sendEmail's assertValidPayload,
    // sendBulk has no subject check, so an empty subject reaches the
    // network layer untouched. BulkComposeForm validation is the only
    // thing stopping an empty-subject bulk send in the UI flow — if that
    // ever changes, this test should change with it.
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });
    const adapter = makeAdapter();
    await expect(
      adapter.sendBulk({
        recipients: [{ email: "a@x.com" }],
        subject: "",
        body: "B",
      })
    ).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("DefaultAdapter.sendBulk — network call", () => {
  it("POSTs to /emails/send-bulk with the exact payload, unmodified", async () => {
    const result: BulkSendResult = { sentCount: 2, failedCount: 0, errors: [] };
    mockFetchOnce(200, result);
    const adapter = makeAdapter();

    const actual = await adapter.sendBulk(validPayload);

    expect(actual).toEqual(result);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/emails/send-bulk");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(validPayload);
  });

  it("surfaces a partially-failed batch's sentCount/failedCount/errors as-is (no throw)", async () => {
    const result: BulkSendResult = {
      sentCount: 1,
      failedCount: 1,
      errors: [{ email: "b@x.com", error: "bounced" }],
    };
    mockFetchOnce(200, result);
    const adapter = makeAdapter();

    const actual = await adapter.sendBulk(validPayload);
    expect(actual).toEqual(result);
  });

  it("rejects when the backend responds with a non-2xx status", async () => {
    mockFetchOnce(500, { message: "Server exploded" });
    const adapter = makeAdapter();
    await expect(adapter.sendBulk(validPayload)).rejects.toThrow(/500/);
  });
});

describe("DefaultAdapter.sendBulk — onProgress (bare callback param)", () => {
  it("fires onProgress(0, total) before the request and onProgress(total, total) after", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const adapter = makeAdapter();
    const onProgress = vi.fn();

    // NOTE: onProgress is the bare second positional argument, not
    // wrapped in an options object — matches this repo's actual
    // EmailAdapter.sendBulk signature.
    await adapter.sendBulk(validPayload, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("uses sentCount + failedCount (not recipients.length) for the final call", async () => {
    // 3 recipients requested, backend only accounts for 2 in its result
    // (e.g. a duplicate collapsed server-side) — the final progress call
    // should reflect what the backend actually reports finishing.
    const result: BulkSendResult = {
      sentCount: 1,
      failedCount: 1,
      errors: [{ email: "c@x.com", error: "duplicate" }],
    };
    mockFetchOnce(200, result);
    const adapter = makeAdapter();
    const onProgress = vi.fn();

    await adapter.sendBulk(
      {
        recipients: [
          { email: "a@x.com" },
          { email: "b@x.com" },
          { email: "c@x.com" },
        ],
        subject: "S",
        body: "B",
      },
      onProgress
    );

    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("does not throw and does not call the network extra times when onProgress is omitted", async () => {
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const adapter = makeAdapter();
    await expect(adapter.sendBulk(validPayload)).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("still calls onProgress(0, total) even when validation is about to fail — NO: validation throws first", async () => {
    // Sanity check on ordering: validation happens BEFORE onProgress(0, total)
    // ever fires, so a caller relying on onProgress can assume it never
    // fires for a request that gets rejected client-side.
    const onProgress = vi.fn();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const adapter = makeAdapter();

    await expect(
      adapter.sendBulk({ recipients: [], subject: "S", body: "B" }, onProgress)
    ).rejects.toThrow();
    expect(onProgress).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("DefaultAdapter.sendBulk — personalization payload", () => {
  it("passes per-recipient placeholderData through untouched for the backend to render", async () => {
    mockFetchOnce(200, { sentCount: 1, failedCount: 0, errors: [] });
    const adapter = makeAdapter();

    const payload: BulkEmailPayload = {
      recipients: [{ email: "a@x.com", placeholderData: { name: "Alice" } }],
      subject: "Hi {name}",
      body: "Hello {name}, welcome!",
    };
    await adapter.sendBulk(payload);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.recipients[0].placeholderData).toEqual({ name: "Alice" });
  });

  it("passes top-level shared placeholders alongside per-recipient overrides", async () => {
    // Per the doc comment on BulkRecipient: top-level `placeholders`
    // (inherited from EmailPayload) act as shared defaults; a matching
    // key in a recipient's own placeholderData overrides it for that
    // recipient. The adapter doesn't merge these itself — it just
    // forwards both untouched for the backend to resolve.
    mockFetchOnce(200, { sentCount: 2, failedCount: 0, errors: [] });
    const adapter = makeAdapter();

    const payload: BulkEmailPayload = {
      recipients: [
        { email: "a@x.com" },
        {
          email: "b@x.com",
          placeholderData: { course_name: "Advanced Biology" },
        },
      ],
      subject: "Reminder: {course_name}",
      body: "Your class starts soon.",
      placeholders: { course_name: "General Course" },
    };
    await adapter.sendBulk(payload);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.placeholders).toEqual({ course_name: "General Course" });
    expect(sentBody.recipients[1].placeholderData).toEqual({
      course_name: "Advanced Biology",
    });
  });
});
