import { ApiClient } from "./ApiClient";
import { EmailAdapter } from "./types";

export const createDefaultAdapter = (client: ApiClient): EmailAdapter => ({
  sendEmail: (payload) =>
    client.request("/send", { method: "POST", body: JSON.stringify(payload) }),
  sendBulk: (payload) =>
    client.request("/send/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  mailbox: () => client.request("/mailbox"),
  logs: () => client.request("/logs"),
  analytics: () => client.request("/analytics"),
});
