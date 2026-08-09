import {
  defineComponent,
  h,
  ref,
  computed,
  watch,
  onBeforeUnmount,
  type PropType,
} from "vue";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  MailboxItem,
  WidgetMode,
  WidgetTheme,
} from "@eaw/core";

/**
 * `<EmailAutomationWidget>` — the Vue 3 wrapper around the Core SDK.
 * Mirrors `@eaw/react`'s `EmailAutomationWidget` behaviour so every
 * framework wrapper stays behaviourally identical; only the rendering
 * layer differs (Vue's `h()` render function here, JSX in React).
 *
 * Usage:
 *   <EmailAutomationWidget mode="mailbox" base-url="/api" :token="token" />
 */
export const EmailAutomationWidget = defineComponent({
  name: "EmailAutomationWidget",
  props: {
    mode: { type: String as PropType<WidgetMode>, default: "dashboard" },
    layout: { type: String as PropType<"full" | "embedded">, default: "full" },
    theme: {
      type: Object as PropType<Partial<WidgetTheme>>,
      default: undefined,
    },
    baseUrl: { type: String, default: "/api" },
    token: { type: String, default: undefined },
    onError: {
      type: Function as PropType<(error: Error) => void>,
      default: undefined,
    },
    onEmailSent: {
      type: Function as PropType<(entry: unknown) => void>,
      default: undefined,
    },
  },
  emits: ["error", "email-sent"],
  setup(props, { emit }) {
    const emails = ref<MailboxItem[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    const resolvedTheme = computed(() => resolveTheme(props.theme));
    const cssVars = computed(() => themeToCssVars(resolvedTheme.value));

    const adapter = computed(() => {
      const client = new ApiClient(
        props.baseUrl,
        props.token ? { type: "Bearer", token: props.token } : undefined
      );
      return createDefaultAdapter(client);
    });

    let cancelled = false;
    onBeforeUnmount(() => {
      cancelled = true;
    });

    async function loadMailbox() {
      cancelled = false;
      loading.value = true;
      error.value = null;
      try {
        const result = await adapter.value.mailbox();
        if (!cancelled) emails.value = result.items;
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load mailbox";
        error.value = message;
        const e = err instanceof Error ? err : new Error(message);
        props.onError?.(e);
        emit("error", e);
      } finally {
        if (!cancelled) loading.value = false;
      }
    }

    watch(
      () => [props.mode, props.baseUrl, props.token],
      () => {
        if (props.mode === "mailbox") loadMailbox();
      },
      { immediate: true }
    );

    return () =>
      h(
        "div",
        {
          class: "eaw-root",
          "data-layout": props.layout,
          style: {
            ...cssVars.value,
            padding: "20px",
            border: "1px solid var(--eaw-color-border)",
            borderRadius: "var(--eaw-radius)",
            background: "var(--eaw-color-bg)",
            color: "var(--eaw-color-text-primary)",
            fontFamily: "var(--eaw-font-family)",
          },
        },
        [
          h(
            "h2",
            { style: { margin: "0 0 12px", fontSize: "18px" } },
            "Email Automation Widget"
          ),

          props.mode === "mailbox" &&
            (loading.value
              ? h("p", null, "Loading mailbox…")
              : error.value
              ? h(
                  "p",
                  { style: { color: "var(--eaw-color-danger)" } },
                  error.value
                )
              : h(
                  "ul",
                  { style: { listStyle: "none", margin: 0, padding: 0 } },
                  emails.value.length === 0
                    ? [h("li", null, "No messages yet.")]
                    : emails.value.map((mail) =>
                        h(
                          "li",
                          {
                            key: mail.id,
                            style: {
                              padding: "8px 0",
                              borderBottom: "1px solid var(--eaw-color-border)",
                            },
                          },
                          [
                            h("strong", null, mail.subject),
                            " ",
                            h(
                              "span",
                              {
                                style: {
                                  color: "var(--eaw-color-text-secondary)",
                                },
                              },
                              `— ${mail.from}`
                            ),
                          ]
                        )
                      )
                )),

          props.mode === "dashboard" &&
            h(
              "p",
              { style: { color: "var(--eaw-color-text-secondary)" } },
              "Dashboard content coming in a later milestone."
            ),
        ]
      );
  },
});

export default EmailAutomationWidget;
