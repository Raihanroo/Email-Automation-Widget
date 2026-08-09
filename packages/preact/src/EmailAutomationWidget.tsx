import { useEffect, useMemo, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  MailboxItem,
  WidgetProps,
} from "@eaw/core";

/**
 * `<EmailAutomationWidget />` — the Preact wrapper around the Core SDK.
 * Mirrors `@eaw/react`'s behaviour (Preact's hooks API is a near-drop-in
 * for React's) so every framework wrapper stays behaviourally identical;
 * only the rendering layer differs.
 *
 * Usage:
 *   <EmailAutomationWidget mode="mailbox" baseURL="/api" token={token} />
 */
export function EmailAutomationWidget({
  mode = "dashboard",
  layout = "full",
  theme: themeOverride,
  baseURL = "/api",
  token,
  onError,
}: WidgetProps): JSX.Element {
  const [emails, setEmails] = useState<MailboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = useMemo(() => resolveTheme(themeOverride), [themeOverride]);
  const cssVars = useMemo(
    () => themeToCssVars(theme) as JSX.CSSProperties,
    [theme]
  );

  const adapter = useMemo(() => {
    const client = new ApiClient(
      baseURL,
      token ? { type: "Bearer", token } : undefined
    );
    return createDefaultAdapter(client);
  }, [baseURL, token]);

  useEffect(() => {
    if (mode !== "mailbox") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    adapter
      .mailbox()
      .then((result) => {
        if (!cancelled) setEmails(result.items);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        onError?.(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, adapter, onError]);

  return (
    <div
      class="eaw-root"
      data-layout={layout}
      style={{
        ...cssVars,
        padding: "20px",
        border: "1px solid var(--eaw-color-border)",
        borderRadius: "var(--eaw-radius)",
        background: "var(--eaw-color-bg)",
        color: "var(--eaw-color-text-primary)",
        fontFamily: "var(--eaw-font-family)",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: "18px" }}>
        Email Automation Widget
      </h2>

      {mode === "mailbox" && (
        <>
          {loading && <p>Loading mailbox…</p>}
          {error && <p style={{ color: "var(--eaw-color-danger)" }}>{error}</p>}
          {!loading && !error && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {emails.map((mail) => (
                <li
                  key={mail.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--eaw-color-border)",
                  }}
                >
                  <strong>{mail.subject}</strong>{" "}
                  <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                    — {mail.from}
                  </span>
                </li>
              ))}
              {emails.length === 0 && <li>No messages yet.</li>}
            </ul>
          )}
        </>
      )}

      {mode === "dashboard" && (
        <p style={{ color: "var(--eaw-color-text-secondary)" }}>
          Dashboard content coming in a later milestone.
        </p>
      )}
    </div>
  );
}

export default EmailAutomationWidget;
