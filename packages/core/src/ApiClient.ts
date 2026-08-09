import { AuthConfig } from "./types";
import { ApiError, TimeoutError } from "./errors";

export interface ApiClientOptions {
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 0;

/**
 * Thin, framework-agnostic HTTP client used by adapters to talk to a
 * real backend. No mocking — callers must point it at an actual API.
 */
export class ApiClient {
  private readonly baseURL: string;
  private readonly auth?: AuthConfig;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    baseURL: string,
    auth?: AuthConfig,
    options: ApiClientOptions = {}
  ) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.auth = auth;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
  }

  private buildHeaders(extra?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(extra as Record<string, string>),
    };

    if (this.auth) {
      switch (this.auth.type) {
        case "Bearer":
          headers["Authorization"] = `Bearer ${this.auth.token}`;
          break;
        case "Basic":
          headers["Authorization"] = `Basic ${this.auth.token}`;
          break;
        case "API_KEY":
          headers[this.auth.headerName ?? "X-API-Key"] = this.auth.token;
          break;
      }
    }

    return headers;
  }

  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    let attempt = 0;

     
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, {
          ...options,
          headers: this.buildHeaders(options.headers),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            body = await res.text().catch(() => undefined);
          }
          throw new ApiError(
            `API request failed with status ${res.status}`,
            res.status,
            endpoint,
            body
          );
        }

        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      } catch (err) {
        clearTimeout(timeout);

        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        if (isAbort) {
          if (attempt < this.retries) {
            attempt++;
            continue;
          }
          throw new TimeoutError(endpoint, this.timeoutMs);
        }

        if (err instanceof ApiError) {
          if (err.status >= 500 && attempt < this.retries) {
            attempt++;
            continue;
          }
          throw err;
        }

        if (attempt < this.retries) {
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  get<T = unknown>(
    endpoint: string,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    const query = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
          )
          .join("&")
      : "";
    return this.request<T>(`${endpoint}${query}`, { method: "GET" });
  }

  post<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T = unknown>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}
