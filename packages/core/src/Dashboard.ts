import {
  EmailAdapter,
  AnalyticsSummary,
  EmailLogEntry,
  MailboxItem,
} from "./types";

export interface DashboardData {
  analytics: AnalyticsSummary;
  recentLogs: EmailLogEntry[];
  recentMailbox: MailboxItem[];
}

export type DashboardStatTone = "default" | "success" | "danger";

export interface DashboardStat {
  label: string;
  value: string;
  tone: DashboardStatTone;
}

const RECENT_ITEM_COUNT = 5;

/**
 * Aggregates the three read endpoints a dashboard needs — analytics,
 * recent send logs, and recent mailbox items — into a single call so
 * every framework wrapper fetches (and renders) exactly the same data
 * with the same request shape.
 *
 * This is the only place dashboard business logic lives; wrappers only
 * bind the result to their own markup (see the "Architecture Principle"
 * in the project README — Core SDK owns logic, wrappers own UI).
 */
export async function loadDashboardData(
  adapter: EmailAdapter
): Promise<DashboardData> {
  const [analytics, logsPage, mailboxPage] = await Promise.all([
    adapter.analytics(),
    adapter.logs({ pageSize: RECENT_ITEM_COUNT }),
    adapter.mailbox({ pageSize: RECENT_ITEM_COUNT }),
  ]);

  return {
    analytics,
    recentLogs: logsPage.items,
    recentMailbox: mailboxPage.items,
  };
}

/**
 * Converts a raw AnalyticsSummary into the small set of stat cards every
 * wrapper renders identically, so percentage formatting/rounding and
 * "is this rate bad enough to flag" logic isn't duplicated per framework.
 */
export function dashboardStats(analytics: AnalyticsSummary): DashboardStat[] {
  return [
    {
      label: "Total Sent",
      value: String(analytics.totalSent),
      tone: "default",
    },
    {
      label: "Opened",
      value: String(analytics.totalOpened),
      tone: "success",
    },
    {
      label: "Failed",
      value: String(analytics.totalFailed),
      tone: analytics.totalFailed > 0 ? "danger" : "default",
    },
    {
      label: "Open Rate",
      value: `${Math.round(analytics.openRate * 100)}%`,
      tone: "default",
    },
    {
      label: "Bounce Rate",
      value: `${Math.round(analytics.bounceRate * 100)}%`,
      tone: analytics.bounceRate > 0.05 ? "danger" : "default",
    },
  ];
}

/** Human-readable label for an EmailLogEntry status, shared across wrappers. */
export function statusLabel(status: EmailLogEntry["status"]): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "opened":
      return "Opened";
    case "failed":
      return "Failed";
    case "bounced":
      return "Bounced";
    case "queued":
      return "Queued";
    default:
      return status;
  }
}

/** Tone used to colour a status badge, shared across wrappers. */
export function statusTone(status: EmailLogEntry["status"]): DashboardStatTone {
  switch (status) {
    case "failed":
    case "bounced":
      return "danger";
    case "opened":
      return "success";
    default:
      return "default";
  }
}
