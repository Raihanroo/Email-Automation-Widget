import React, { useState, useEffect } from "react";
import { createDefaultAdapter, ApiClient } from "@eaw/core";

interface WidgetProps {
  baseURL?: string;
  token?: string;
  mode?: "dashboard" | "composer" | "mailbox";
}

export const EmailAutomationWidget: React.FC<WidgetProps> = ({
  baseURL = "/api",
  token,
  mode = "dashboard",
}) => {
  const [emails, setEmails] = useState<any[]>([]);

  useEffect(() => {
    const client = new ApiClient(
      baseURL,
      token ? { type: "Bearer", token } : undefined
    );
    const adapter = createDefaultAdapter(client);

    if (mode === "mailbox") {
      adapter.mailbox().then(setEmails);
    }
  }, [baseURL, token, mode]);

  return (
    <div
      style={{
        padding: "20px",
        border: "1px solid #ccc",
        borderRadius: "8px",
        fontFamily: "sans-serif",
      }}
    >
      <h2>Email Automation Widget</h2>
      {mode === "mailbox" && (
        <ul>
          {emails.map((mail, i) => (
            <li key={i}>
              {mail.subject} - <i>{mail.from}</i>
            </li>
          ))}
        </ul>
      )}
      {mode === "dashboard" && <p>Dashboard Content Loading...</p>}
    </div>
  );
};
