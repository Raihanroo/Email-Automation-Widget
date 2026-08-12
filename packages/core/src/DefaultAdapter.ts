import { ApiClient } from "./ApiClient";
import {
  EmailAdapter,
  EmailPayload,
  BulkEmailPayload,
  BulkProgressHandler,
  BulkSendResult,
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

  sendBulk: async (
    payload: BulkEmailPayload,
    onProgress?: BulkProgressHandler
  ) => {
    if (!payload.recipients?.length) {
      throw new ValidationError(
        "recipients must contain at least one address",
        "recipients"
      );
    }
    const invalid = payload.recipients
      .map((r) => r.email)
      .filter((email) => !isValidEmail(email));
    if (invalid.length) {
      throw new ValidationError(
        `Invalid recipient email(s): ${invalid.join(", ")}`,
        "recipients"
      );
    }

    const total = payload.recipients.length;
    // Reference backend (EduCRM's /send-bulk/) is a single blocking POST —
    // the whole batch is processed server-side and only one final result
    // comes back, so there's no real per-item progress yet. We still
    // signal start (0, total) and finish (n, total) so wrapper UIs that
    // already wire a progress indicator to onProgress keep working
    // unchanged if a future backend adds real streaming progress.
    onProgress?.(0, total);
    const result = await client.post<BulkSendResult>(
      "/emails/send-bulk",
      payload
    );
    onProgress?.(result.sentCount + result.failedCount, total);
    return result;
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
