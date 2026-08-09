import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  For,
  Show,
} from "solid-js";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  MailboxItem,
  WidgetProps,
} from "@eaw/core";

/**
 * `<EmailAutomationWidget />` — the SolidJS wrapper around the Core SDK.
 * Mirrors `@eaw/react` and `@eaw/vue`'s behaviour so every framework
 * wrapper stays behaviourally identical; only the rendering layer
 * differs (Solid's fine-grained reactivity here).
 *
 * Usage:
 *   <EmailAutomationWidget mode="mailbox" baseURL="/api" token={token} />
 */
export function EmailAutomationWidget(props: WidgetProps) {
  const mode = () => props.mode ?? "dashboard";
  const layout = () => props.layout ?? "full";
  const baseURL = () => props.baseURL ?? "/api";

  const [emails, setEmails] = createSignal<MailboxItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const theme = createMemo(() => resolveTheme(props.theme));
  const cssVars = createMemo(() => themeToCssVars(theme()));

  const adapter = createMemo(() => {
    const client = new ApiClient(
      baseURL(),
      props.token ? { type: "Bearer", token: props.token } : undefined
    );
    return createDefaultAdapter(client);
  });

  createEffect(() => {
    if (mode() !== "mailbox") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    adapter()
      .mailbox()
      .then((result) => {
        if (!cancelled) setEmails(result.items);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        props.onError?.(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    onCleanup(() => {
      cancelled = true;
    });
  });

  return (
    <div
      class="eaw-root"
      data-layout={layout()}
      style={{
        ...cssVars(),
        padding: "20px",
        border: "1px solid var(--eaw-color-border)",
        "border-radius": "var(--eaw-radius)",
        background: "var(--eaw-color-bg)",
        color: "var(--eaw-color-text-primary)",
        "font-family": "var(--eaw-font-family)",
      }}
    >
      <h2 style={{ margin: "0 0 12px", "font-size": "18px" }}>
        Email Automation Widget
      </h2>

      <Show when={mode() === "mailbox"}>
        <Show when={loading()}>
          <p>Loading mailbox…</p>
        </Show>
        <Show when={!loading() && error()}>
          <p style={{ color: "var(--eaw-color-danger)" }}>{error()}</p>
        </Show>
        <Show when={!loading() && !error()}>
          <ul style={{ "list-style": "none", margin: 0, padding: 0 }}>
            <For each={emails()} fallback={<li>No messages yet.</li>}>
              {(mail) => (
                <li
                  style={{
                    padding: "8px 0",
                    "border-bottom": "1px solid var(--eaw-color-border)",
                  }}
                >
                  <strong>{mail.subject}</strong>{" "}
                  <span style={{ color: "var(--eaw-color-text-secondary)" }}>
                    — {mail.from}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={mode() === "dashboard"}>
        <p style={{ color: "var(--eaw-color-text-secondary)" }}>
          Dashboard content coming in a later milestone.
        </p>
      </Show>
    </div>
  );
}

export default EmailAutomationWidget;
