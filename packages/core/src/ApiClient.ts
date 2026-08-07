import { AuthConfig } from "./types";

export class ApiClient {
  constructor(private baseURL: string, private auth?: AuthConfig) {}

  async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.auth?.type === "Bearer" && this.auth.token) {
      headers["Authorization"] = `Bearer ${this.auth.token}`;
    }

    // Mock response for testing without a real backend
    if (endpoint.includes("/mailbox")) {
      return Promise.resolve([
        {
          id: 1,
          subject: "Test Mail from Core Engine",
          from: "test@example.com",
        },
      ]);
    }

    try {
      const res = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers,
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return res.json();
    } catch (err) {
      console.error("API Request Failed, returning mock data:", err);
      return [];
    }
  }
}
