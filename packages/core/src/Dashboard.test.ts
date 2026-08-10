import { describe, it, expect, vi } from "vitest";
import {
  loadDashboardData,
  dashboardStats,
  statusLabel,
  statusTone,
} from "./Dashboard";
import type {
  EmailAdapter,
  AnalyticsSummary,
  EmailLogEntry,
  MailboxItem,
} from "./types";

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

const analytics: AnalyticsSummary = {
  totalSent: 100,
  totalOpened: 40,
  totalFailed: 5,
  openRate: 0.4,
  bounceRate: 0.08,
};

describe("loadDashboardData", () => {
  it("requests analytics, logs, and mailbox with pageSize 5 and aggregates the result", async () => {
    const logs = vi.fn(async (opts?: { pageSize?: number }) => {
      expect(opts?.pageSize).toBe(5);
      return {
        items: [
          {
            id: "l1",
            subject: "Newsletter",
            to: "b@x.com",
            status: "failed",
            sentAt: "now",
          } as EmailLogEntry,
        ],
        total: 1,
      };
    });
    const mailbox = vi.fn(async (opts?: { pageSize?: number }) => {
      expect(opts?.pageSize).toBe(5);
      return {
        items: [{ id: "m1", subject: "Hi", from: "a@x.com" } as MailboxItem],
        total: 1,
      };
    });
    const adapter = mockAdapter({
      analytics: async () => analytics,
      logs,
      mailbox,
    });

    const data = await loadDashboardData(adapter);

    expect(logs).toHaveBeenCalledTimes(1);
    expect(mailbox).toHaveBeenCalledTimes(1);
    expect(data.analytics.totalSent).toBe(100);
    expect(data.recentLogs).toHaveLength(1);
    expect(data.recentLogs[0].id).toBe("l1");
    expect(data.recentMailbox).toHaveLength(1);
    expect(data.recentMailbox[0].id).toBe("m1");
  });
});

describe("dashboardStats", () => {
  it("flags bounce rate as danger when above 5%", () => {
    const stats = dashboardStats(analytics);
    const bounce = stats.find((s) => s.label === "Bounce Rate")!;
    expect(bounce.value).toBe("8%");
    expect(bounce.tone).toBe("danger");
  });

  it("flags Failed as danger whenever totalFailed > 0", () => {
    const stats = dashboardStats(analytics);
    expect(stats.find((s) => s.label === "Failed")!.tone).toBe("danger");
  });

  it("formats open rate as a rounded percentage", () => {
    const stats = dashboardStats(analytics);
    expect(stats.find((s) => s.label === "Open Rate")!.value).toBe("40%");
  });

  it("does not flag a healthy bounce/failed rate", () => {
    const good: AnalyticsSummary = {
      totalSent: 100,
      totalOpened: 90,
      totalFailed: 0,
      openRate: 0.9,
      bounceRate: 0.01,
    };
    const stats = dashboardStats(good);
    expect(stats.find((s) => s.label === "Bounce Rate")!.tone).toBe("default");
    expect(stats.find((s) => s.label === "Failed")!.tone).toBe("default");
  });
});

describe("statusLabel / statusTone", () => {
  it("maps each status to a human label", () => {
    expect(statusLabel("bounced")).toBe("Bounced");
    expect(statusLabel("opened")).toBe("Opened");
    expect(statusLabel("queued")).toBe("Queued");
  });

  it("maps each status to the correct tone", () => {
    expect(statusTone("bounced")).toBe("danger");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("opened")).toBe("success");
    expect(statusTone("queued")).toBe("default");
  });
});
