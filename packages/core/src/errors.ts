export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body?: unknown;

  constructor(
    message: string,
    status: number,
    endpoint: string,
    body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

export class TimeoutError extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class ValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
