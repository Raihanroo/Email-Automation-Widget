import { EmailAdapter, EmailLogEntry, EmailStatus, ListParams } from "./types";
import { statusLabel, statusTone, DashboardStatTone } from "./Dashboard";

export { statusLabel, statusTone };

export const LOG_STATUSES: EmailStatus[] = [
  "queued",
  "sent",
  "opened",
  "failed",
  "bounced",
];

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export interface LogsFilter {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: EmailStatus;
}

export interface LogsPage {
  items: EmailLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Normalizes filter/pagination input, calls adapter.logs, and derives
 * pagination metadata (totalPages, hasNextPage, hasPrevPage) that the
 * backend's PaginatedResult doesn't provide directly — so every wrapper
 * computes "is there a next page" the same way instead of re-deriving
 * it from total/page/pageSize independently.
 */
export async function loadLogsPage(
  adapter: EmailAdapter,
  filter: LogsFilter = {}
): Promise<LogsPage> {
  const page = filter.page && filter.page > 0 ? filter.page : DEFAULT_PAGE;
  const pageSize =
    filter.pageSize && filter.pageSize > 0
      ? filter.pageSize
      : DEFAULT_PAGE_SIZE;
  const query = filter.query?.trim() || undefined;

  const params: ListParams = { page, pageSize, query, status: filter.status };
  const result = await adapter.logs(params);

  const totalPages =
    result.pageSize > 0
      ? Math.max(1, Math.ceil(result.total / result.pageSize))
      : 1;

  return {
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages,
    hasNextPage: result.page < totalPages,
    hasPrevPage: result.page > 1,
  };
}

export interface LogStatusOption {
  value: EmailStatus | "all";
  label: string;
}

/** Shared status filter dropdown options — same order/labels in every wrapper. */
export const LOG_STATUS_FILTER_OPTIONS: LogStatusOption[] = [
  { value: "all", label: "All statuses" },
  ...LOG_STATUSES.map((status) => ({
    value: status,
    label: statusLabel(status),
  })),
];

export interface LogDetailView {
  id: string | number;
  to: string;
  subject: string;
  statusLabel: string;
  statusTone: DashboardStatTone;
  sentAt: string;
  openedAt?: string;
  errorMessage?: string;
}

/**
 * Shapes a raw EmailLogEntry into what the message-detail panel renders.
 * EmailLogEntry has no body/preview field in the current backend
 * contract, so "preview" here is subject + status + timestamps only —
 * not a new backend dependency.
 */
export function toLogDetailView(entry: EmailLogEntry): LogDetailView {
  return {
    id: entry.id,
    to: entry.to,
    subject: entry.subject,
    statusLabel: statusLabel(entry.status),
    statusTone: statusTone(entry.status),
    sentAt: entry.sentAt,
    openedAt: entry.openedAt,
    errorMessage: entry.errorMessage,
  };
}
