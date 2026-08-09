// ============================================================================
// Auth & Client Config
// ============================================================================

export interface AuthConfig {
  type: "Bearer" | "Basic" | "API_KEY";
  token: string;
  headerName?: string; // used when type === "API_KEY", defaults to "X-API-Key"
}

export interface WidgetConfig {
  baseURL: string;
  auth?: AuthConfig;
  timeoutMs?: number;
  retries?: number;
}

// ============================================================================
// Theme
// ============================================================================

export type ThemeRadius = "none" | "sm" | "md" | "lg" | "xl" | "full";
export type ThemeMode = "light" | "dark";

export interface WidgetTheme {
  primary: string;
  secondary?: string;
  background?: string;
  surface?: string;
  textPrimary?: string;
  textSecondary?: string;
  border?: string;
  danger?: string;
  success?: string;
  radius: ThemeRadius;
  mode: ThemeMode;
  fontFamily?: string;
}

// ============================================================================
// Domain Models
// ============================================================================

export interface EmailAttachment {
  filename: string;
  url?: string;
  base64?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface EmailPayload {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  templateId?: string;
  placeholders?: Record<string, string>;
  attachments?: EmailAttachment[];
}

export interface BulkEmailPayload extends Omit<EmailPayload, "to"> {
  recipients: string[];
}

export type EmailStatus = "queued" | "sent" | "failed" | "opened" | "bounced";

export interface MailboxItem {
  id: string | number;
  subject: string;
  from: string;
  to?: string;
  preview?: string;
  receivedAt?: string;
  read?: boolean;
}

export interface EmailLogEntry {
  id: string | number;
  to: string;
  subject: string;
  status: EmailStatus;
  sentAt: string;
  openedAt?: string;
  errorMessage?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  placeholders?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AnalyticsSummary {
  totalSent: number;
  totalOpened: number;
  totalFailed: number;
  openRate: number; // 0..1
  bounceRate: number; // 0..1
  rangeStart?: string;
  rangeEnd?: string;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: EmailStatus;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Adapter Pattern — any backend can implement this interface
// ============================================================================

export interface EmailAdapter {
  sendEmail: (payload: EmailPayload) => Promise<EmailLogEntry>;
  sendBulk: (payload: BulkEmailPayload) => Promise<EmailLogEntry[]>;
  mailbox: (params?: ListParams) => Promise<PaginatedResult<MailboxItem>>;
  logs: (params?: ListParams) => Promise<PaginatedResult<EmailLogEntry>>;
  analytics: (params?: {
    start?: string;
    end?: string;
  }) => Promise<AnalyticsSummary>;
  templates: {
    list: () => Promise<EmailTemplate[]>;
    get: (id: string) => Promise<EmailTemplate>;
    create: (tpl: Omit<EmailTemplate, "id">) => Promise<EmailTemplate>;
    update: (id: string, tpl: Partial<EmailTemplate>) => Promise<EmailTemplate>;
    remove: (id: string) => Promise<void>;
  };
}

// ============================================================================
// Widget Props (shared shape across all framework wrappers)
// ============================================================================

export type WidgetMode =
  | "dashboard"
  | "composer"
  | "mailbox"
  | "logs"
  | "templates"
  | "analytics";

export interface WidgetProps {
  mode?: WidgetMode;
  layout?: "full" | "embedded";
  theme?: Partial<WidgetTheme>;
  adapter?: Partial<EmailAdapter>;
  baseURL?: string;
  token?: string;
  onEmailSent?: (entry: EmailLogEntry) => void;
  onError?: (error: Error) => void;
}
