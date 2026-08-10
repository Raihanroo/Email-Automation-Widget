import { EmailAdapter, EmailLogEntry, EmailPayload } from "./types";
import { isValidEmail } from "./Utils";
import { ValidationError } from "./errors";

/**
 * Plain, framework-agnostic shape for the compose form. Every wrapper
 * keeps its own reactive copy of this (useState/ref/signal/…) but the
 * validation and payload-building rules below are shared, so "what
 * counts as a valid email" or "how CC/BCC get parsed" is defined once.
 */
export interface ComposeFormState {
  to: string;
  cc: string; // comma-separated
  bcc: string; // comma-separated
  subject: string;
  body: string;
}

export function emptyComposeForm(): ComposeFormState {
  return { to: "", cc: "", bcc: "", subject: "", body: "" };
}

export interface ComposeValidationErrors {
  to?: string;
  subject?: string;
  body?: string;
}

/** Field-level validation, safe to call on every keystroke for live feedback. */
export function validateComposeForm(
  form: ComposeFormState
): ComposeValidationErrors {
  const errors: ComposeValidationErrors = {};

  const to = form.to.trim();
  if (!to) errors.to = "Recipient is required";
  else if (!isValidEmail(to)) errors.to = "Enter a valid email address";

  if (!form.subject.trim()) errors.subject = "Subject is required";
  if (!form.body.trim()) errors.body = "Message body is required";

  return errors;
}

export function isComposeFormValid(errors: ComposeValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}

function splitAddressList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

/** Converts form fields (raw strings) into the typed payload the adapter expects. */
export function composeFormToPayload(form: ComposeFormState): EmailPayload {
  return {
    to: form.to.trim(),
    cc: splitAddressList(form.cc),
    bcc: splitAddressList(form.bcc),
    subject: form.subject.trim(),
    body: form.body,
  };
}

/**
 * Validates and sends the compose form in one step. Wrappers call this
 * on submit; it throws a ValidationError (with the first failing field
 * message) before ever hitting the network if the form is incomplete.
 */
export async function submitComposeForm(
  adapter: EmailAdapter,
  form: ComposeFormState
): Promise<EmailLogEntry> {
  const errors = validateComposeForm(form);
  if (!isComposeFormValid(errors)) {
    const [field, message] = Object.entries(errors)[0];
    throw new ValidationError(message ?? "Invalid form", field);
  }
  return adapter.sendEmail(composeFormToPayload(form));
}
