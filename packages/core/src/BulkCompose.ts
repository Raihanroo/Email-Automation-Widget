import {
  BulkEmailPayload,
  BulkProgressHandler,
  BulkRecipient,
  BulkSendResult,
  EmailAdapter,
} from "./types";
import { isValidEmail } from "./Utils";
import { splitAddressList } from "./Compose";
import { ValidationError } from "./errors";

/**
 * Plain, framework-agnostic shape for the bulk-compose form. Same idea
 * as ComposeFormState in Compose.ts — every wrapper keeps its own
 * reactive copy (useState/ref/signal/…), but recipient parsing and
 * validation rules live here once.
 */
export interface BulkComposeFormState {
  /** Raw textarea input: comma- and/or newline-separated email addresses. */
  recipientsRaw: string;
  cc: string; // comma-separated, applies once to the whole batch (see DefaultAdapter/EduCRM note)
  bcc: string; // comma-separated
  subject: string;
  body: string;
}

export function emptyBulkComposeForm(): BulkComposeFormState {
  return { recipientsRaw: "", cc: "", bcc: "", subject: "", body: "" };
}

export interface RecipientParseResult {
  recipients: BulkRecipient[];
  /** Raw strings that didn't pass isValidEmail — surfaced so the UI can warn before sending. */
  invalidEntries: string[];
}

/**
 * Parses a comma- and/or newline-separated block of plain email
 * addresses (the "paste a list" flow — EduCRM's frontend parseEmailList
 * equivalent). No personalization: every recipient gets no placeholderData.
 * Duplicate addresses are removed, case-insensitively.
 */
export function parseRecipients(raw: string): RecipientParseResult {
  const seen = new Set<string>();
  const recipients: BulkRecipient[] = [];
  const invalidEntries: string[] = [];

  const entries = raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (!isValidEmail(entry)) {
      invalidEntries.push(entry);
      continue;
    }
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ email: entry });
  }

  return { recipients, invalidEntries };
}

/** One row of a parsed CSV: raw header→value map before the email column is split out. */
type CsvRow = Record<string, string>;

/**
 * Minimal CSV line splitter that understands double-quoted fields
 * (so a quoted "Doe, John" style value with a comma inside doesn't
 * get split into two columns). Not a full RFC 4180 parser, but
 * sufficient for Excel/Google Sheets exports, matching the CSV
 * shape used by the Excel-column-headers placeholder work.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export interface CsvRecipientParseResult extends RecipientParseResult {
  /** Column headers found, in order — useful for showing the user what got mapped. */
  headers: string[];
  /** True if no column matched an "email" header at all — caller should show a clear error, not just an empty list. */
  missingEmailColumn: boolean;
}

/**
 * Parses a CSV export (e.g. from Excel) into BulkRecipient[], the same
 * "dynamic placeholder from column headers" idea as the earlier
 * Excel-driven placeholder system: any column other than the email
 * column becomes that recipient's placeholderData, so {{firstName}},
 * {{company}}, etc. in the template body get filled per-recipient.
 *
 * The email column is matched case-insensitively against "email" or
 * "email address"; every other column is kept as-is (case preserved)
 * as a placeholder key.
 */
export function parseRecipientsFromCsv(
  csvText: string
): CsvRecipientParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return {
      recipients: [],
      invalidEntries: [],
      headers: [],
      missingEmailColumn: true,
    };
  }

  const headers = Object.keys(rows[0]);
  const emailHeader = headers.find((h) =>
    ["email", "email address"].includes(h.trim().toLowerCase())
  );

  if (!emailHeader) {
    return {
      recipients: [],
      invalidEntries: [],
      headers,
      missingEmailColumn: true,
    };
  }

  const seen = new Set<string>();
  const recipients: BulkRecipient[] = [];
  const invalidEntries: string[] = [];

  for (const row of rows) {
    const email = (row[emailHeader] ?? "").trim();
    if (!email) continue;

    if (!isValidEmail(email)) {
      invalidEntries.push(email);
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const placeholderData: Record<string, string> = {};
    for (const header of headers) {
      if (header === emailHeader) continue;
      const value = row[header];
      if (value) placeholderData[header] = value;
    }

    recipients.push({
      email,
      placeholderData: Object.keys(placeholderData).length
        ? placeholderData
        : undefined,
    });
  }

  return { recipients, invalidEntries, headers, missingEmailColumn: false };
}

export interface BulkComposeValidationErrors {
  recipients?: string;
  subject?: string;
  body?: string;
}

/** Field-level validation, safe to call on every keystroke/parse for live feedback. */
export function validateBulkComposeForm(
  form: BulkComposeFormState,
  recipients: BulkRecipient[]
): BulkComposeValidationErrors {
  const errors: BulkComposeValidationErrors = {};

  if (recipients.length === 0) {
    errors.recipients = "Add at least one valid recipient";
  }
  if (!form.subject.trim()) errors.subject = "Subject is required";
  if (!form.body.trim()) errors.body = "Message body is required";

  return errors;
}

export function isBulkComposeFormValid(
  errors: BulkComposeValidationErrors
): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Converts form fields + already-parsed recipients into the typed
 * payload the adapter expects. Recipient parsing (parseRecipients /
 * parseRecipientsFromCsv) happens separately so the UI can show
 * invalid-entry warnings before the user hits submit.
 */
export function bulkComposeFormToPayload(
  form: BulkComposeFormState,
  recipients: BulkRecipient[]
): BulkEmailPayload {
  return {
    recipients,
    cc: splitAddressList(form.cc),
    bcc: splitAddressList(form.bcc),
    subject: form.subject.trim(),
    body: form.body,
  };
}

/**
 * Validates and sends the bulk-compose form in one step. Wrappers call
 * this on submit; it throws a ValidationError before ever hitting the
 * network if there are no valid recipients or subject/body are empty.
 */
export async function submitBulkComposeForm(
  adapter: EmailAdapter,
  form: BulkComposeFormState,
  recipients: BulkRecipient[],
  onProgress?: BulkProgressHandler
): Promise<BulkSendResult> {
  const errors = validateBulkComposeForm(form, recipients);
  if (!isBulkComposeFormValid(errors)) {
    const [field, message] = Object.entries(errors)[0];
    throw new ValidationError(message ?? "Invalid form", field);
  }
  return adapter.sendBulk(
    bulkComposeFormToPayload(form, recipients),
    onProgress
  );
}
