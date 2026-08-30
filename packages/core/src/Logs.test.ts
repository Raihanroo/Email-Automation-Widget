import { describe, it, expect, vi } from "vitest";
import {
  loadLogsPage,
  toLogDetailView,
  LOG_STATUS_FILTER_OPTIONS,
} from "./Logs";
import type { EmailAdapter, EmailLogEntry } from "./types";

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
  } as EmailAdapter;
}

const entry: EmailLogEntry = {
  id: "l1",
  to: "a@x.com",
  subject: "Newsletter",
  status: "bounced",
  sentAt: "2026-08-01T10:00:00Z",
  errorMessage: "mailbox full",
};

describe("loadLogsPage", () => {
  it("defaults to page 1, pageSize 20 when no filter is given", async () => {
    const logs = vi.fn(async (params) => {
      expect(params).toEqual({
        page: 1,
        pageSize: 20,
        query: undefined,
        status: undefined,
      });
      return { items: [entry], total: 1, page: 1, pageSize: 20 };
    });
    const adapter = mockAdapter({ logs });

    const result = await loadLogsPage(adapter);
    expect(logs).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
  });

  it("trims a whitespace-only query down to undefined", async () => {
    const logs = vi.fn(async (params) => {
      expect(params?.query).toBeUndefined();
      return { items: [], total: 0, page: 1, pageSize: 20 };
    });
    const adapter = mockAdapter({ logs });

    await loadLogsPage(adapter, { query: "   " });
    expect(logs).toHaveBeenCalledTimes(1);
  });

  it("forwards status filter untouched", async () => {
    const logs = vi.fn(async (params) => {
      expect(params?.status).toBe("failed");
      return { items: [], total: 0, page: 1, pageSize: 20 };
    });
    const adapter = mockAdapter({ logs });

    await loadLogsPage(adapter, { status: "failed" });
    expect(logs).toHaveBeenCalledTimes(1);
  });

  it("computes totalPages, hasNextPage, and hasPrevPage from total/page/pageSize", async () => {
    const logs = vi.fn(async () => ({
      items: [entry],
      total: 45,
      page: 2,
      pageSize: 20,
    }));
    const adapter = mockAdapter({ logs });

    const result = await loadLogsPage(adapter, { page: 2 });
    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPrevPage).toBe(true);
  });

  it("reports hasNextPage=false on the last page", async () => {
    const logs = vi.fn(async () => ({
      items: [],
      total: 45,
      page: 3,
      pageSize: 20,
    }));
    const adapter = mockAdapter({ logs });

    const result = await loadLogsPage(adapter, { page: 3 });
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPrevPage).toBe(true);
  });

  it("falls back to defaults when page/pageSize are invalid (0 or negative)", async () => {
    const logs = vi.fn(async (params) => {
      expect(params?.page).toBe(1);
      expect(params?.pageSize).toBe(20);
      return { items: [], total: 0, page: 1, pageSize: 20 };
    });
    const adapter = mockAdapter({ logs });

    await loadLogsPage(adapter, { page: -1, pageSize: 0 });
    expect(logs).toHaveBeenCalledTimes(1);
  });
});

describe("toLogDetailView", () => {
  it("maps status to a human label and tone, and passes through the rest", () => {
    const view = toLogDetailView(entry);
    expect(view.statusLabel).toBe("Bounced");
    expect(view.statusTone).toBe("danger");
    expect(view.to).toBe("a@x.com");
    expect(view.errorMessage).toBe("mailbox full");
  });
});

describe("LOG_STATUS_FILTER_OPTIONS", () => {
  it("starts with an 'all' option followed by every EmailStatus", () => {
    expect(LOG_STATUS_FILTER_OPTIONS[0]).toEqual({
      value: "all",
      label: "All statuses",
    });
    expect(LOG_STATUS_FILTER_OPTIONS).toHaveLength(6);
  });
});
