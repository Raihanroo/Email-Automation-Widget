import { ApiClient } from "./ApiClient";
import {
  EmailAdapter,
  EmailPayload,
  BulkEmailPayload,
  EmailLogEntry,
  MailboxItem,
  EmailTemplate,
  AnalyticsSummary,
  ListParams,
  PaginatedResult,
} from "./types";
import { ValidationError } from "./errors";
import { isValidEmail } from "./Utils";

function assertValidPayload(payload: EmailPayload) {
  if (!payload.to || !isValidEmail(payload.to)) {
    throw new ValidationError(`Invalid recipient email: "${payload.to}"`, "to");
  }
  if (!payload.subject?.trim()) {
    throw new ValidationError("Subject is required", "subject");
  }
}

/**
 * REST-based implementation of EmailAdapter. Every method maps 1:1 to a
 * real backend endpoint — no mocked/hardcoded responses. Backends that
 * follow a different convention can supply their own adapter that
 * implements the same EmailAdapter interface.
 */
export const createDefaultAdapter = (client: ApiClient): EmailAdapter => ({
  sendEmail: (payload: EmailPayload) => {
    assertValidPayload(payload);
    return client.post<EmailLogEntry>("/emails/send", payload);
  },

  sendBulk: (payload: BulkEmailPayload) => {
    if (!payload.recipients?.length) {
      throw new ValidationError(
        "recipients must contain at least one address",
        "recipients"
      );
    }
    const invalid = payload.recipients.filter((r) => !isValidEmail(r));
    if (invalid.length) {
      throw new ValidationError(
        `Invalid recipient email(s): ${invalid.join(", ")}`,
        "recipients"
      );
    }
    return client.post<EmailLogEntry[]>("/emails/send-bulk", payload);
  },

  mailbox: (params?: ListParams) =>
    client.get<PaginatedResult<MailboxItem>>("/emails/mailbox", {
      page: params?.page,
      pageSize: params?.pageSize,
      query: params?.query,
    }),

  logs: (params?: ListParams) =>
    client.get<PaginatedResult<EmailLogEntry>>("/emails/logs", {
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
    }),

  analytics: (params?: { start?: string; end?: string }) =>
    client.get<AnalyticsSummary>("/emails/analytics", {
      start: params?.start,
      end: params?.end,
    }),

  templates: {
    list: () => client.get<EmailTemplate[]>("/templates"),
    get: (id: string) => client.get<EmailTemplate>(`/templates/${id}`),
    create: (tpl: Omit<EmailTemplate, "id">) =>
      client.post<EmailTemplate>("/templates", tpl),
    update: (id: string, tpl: Partial<EmailTemplate>) =>
      client.patch<EmailTemplate>(`/templates/${id}`, tpl),
    remove: (id: string) => client.delete<void>(`/templates/${id}`),
  },
});
