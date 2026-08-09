<script lang="ts">
  import {
    ApiClient,
    createDefaultAdapter,
    resolveTheme,
    themeToCssVars,
    type MailboxItem,
    type WidgetMode,
    type WidgetTheme,
  } from "@eaw/core";

  /**
   * `<EmailAutomationWidget>` — the Svelte 5 wrapper around the Core SDK.
   * Mirrors `@eaw/react`, `@eaw/vue`, and `@eaw/angular` behaviour
   * exactly; only the rendering layer (Svelte template + runes) differs.
   */
  interface Props {
    mode?: WidgetMode;
    layout?: "full" | "embedded";
    theme?: Partial<WidgetTheme>;
    baseURL?: string;
    token?: string;
    onError?: (error: Error) => void;
    onEmailSent?: (entry: unknown) => void;
  }

  let {
    mode = "dashboard",
    layout = "full",
    theme,
    baseURL = "/api",
    token,
    onError,
  }: Props = $props();

  let emails = $state<MailboxItem[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  const resolvedTheme = $derived(resolveTheme(theme));
  const cssVars = $derived(themeToCssVars(resolvedTheme));

  const adapter = $derived.by(() => {
    const client = new ApiClient(baseURL, token ? { type: "Bearer", token } : undefined);
    return createDefaultAdapter(client);
  });

  async function loadMailbox() {
    loading = true;
    errorMessage = null;
    try {
      const result = await adapter.mailbox();
      emails = result.items;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load mailbox";
      errorMessage = message;
      onError?.(err instanceof Error ? err : new Error(message));
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (mode === "mailbox") {
      void loadMailbox();
    }
  });
</script>

<div class="eaw-root" data-layout={layout} style={Object.entries(cssVars).map(([k, v]) => `${k}:${v}`).join(";") + ";padding:20px;border:1px solid var(--eaw-color-border);border-radius:var(--eaw-radius);background:var(--eaw-color-bg);color:var(--eaw-color-text-primary);font-family:var(--eaw-font-family);"}>
  <h2 style="margin:0 0 12px;font-size:18px;">Email Automation Widget</h2>

  {#if mode === "mailbox"}
    {#if loading}
      <p>Loading mailbox…</p>
    {:else if errorMessage}
      <p style="color:var(--eaw-color-danger);">{errorMessage}</p>
    {:else}
      <ul style="list-style:none;margin:0;padding:0;">
        {#each emails as mail (mail.id)}
          <li style="padding:8px 0;border-bottom:1px solid var(--eaw-color-border);">
            <strong>{mail.subject}</strong>
            <span style="color:var(--eaw-color-text-secondary);"> — {mail.from}</span>
          </li>
        {:else}
          <li>No messages yet.</li>
        {/each}
      </ul>
    {/if}
  {:else if mode === "dashboard"}
    <p style="color:var(--eaw-color-text-secondary);">Dashboard content coming in a later milestone.</p>
  {/if}
</div>
