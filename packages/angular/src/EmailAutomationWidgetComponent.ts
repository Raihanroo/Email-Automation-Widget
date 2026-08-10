import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from "@angular/core";
import {
  ApiClient,
  createDefaultAdapter,
  resolveTheme,
  themeToCssVars,
  EmailAdapter,
  MailboxItem,
  WidgetMode,
  WidgetTheme,
} from "@eaw/core";

/**
 * `<eaw-email-automation-widget>` — the Angular wrapper around the Core
 * SDK. Mirrors `@eaw/react`'s `EmailAutomationWidget` behaviour so every
 * framework wrapper stays behaviourally identical; only the rendering
 * layer differs (Angular templates here, JSX in React).
 *
 * Usage:
 *   <eaw-email-automation-widget
 *     [mode]="'mailbox'"
 *     [baseURL]="'/api'"
 *     [token]="token"
 *     (error)="onError($event)" />
 */
@Component({
  selector: "eaw-email-automation-widget",
  standalone: true,
  template: `
    <div class="eaw-root" [attr.data-layout]="layout" [style]="cssVars">
      <h2 class="eaw-title">Email Automation Widget</h2>

      @if (mode === "mailbox") { @if (loading) {
      <p>Loading mailbox…</p>
      } @if (errorMessage) {
      <p class="eaw-error">{{ errorMessage }}</p>
      } @if (!loading && !errorMessage) {
      <ul>
        @for (mail of emails; track mail.id) {
        <li>
          <strong>{{ mail.subject }}</strong>
          <span class="eaw-muted">— {{ mail.from }}</span>
        </li>
        } @empty {
        <li>No messages yet.</li>
        }
      </ul>
      } } @if (mode === "dashboard") {
      <p class="eaw-muted">Dashboard content coming in a later milestone.</p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .eaw-root {
        padding: 20px;
        border: 1px solid var(--eaw-color-border, #e5e7eb);
        border-radius: var(--eaw-radius, 8px);
        background: var(--eaw-color-bg, #ffffff);
        color: var(--eaw-color-text-primary, #111827);
        font-family: var(--eaw-font-family, sans-serif);
      }
      .eaw-title {
        margin: 0 0 12px;
        font-size: 18px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        padding: 8px 0;
        border-bottom: 1px solid var(--eaw-color-border, #e5e7eb);
      }
      .eaw-muted {
        color: var(--eaw-color-text-secondary, #6b7280);
      }
      .eaw-error {
        color: var(--eaw-color-danger, #dc2626);
      }
    `,
  ],
})
export class EmailAutomationWidgetComponent implements OnInit, OnChanges {
  @Input() mode: WidgetMode = "dashboard";
  @Input() layout: "full" | "embedded" = "full";
  @Input() theme?: Partial<WidgetTheme>;
  @Input() baseURL = "/api";
  @Input() token?: string;
  @Input() adapter?: Partial<EmailAdapter>;

  @Output() error = new EventEmitter<Error>();

  loading = false;
  emails: MailboxItem[] = [];
  errorMessage: string | null = null;

  private _adapter!: EmailAdapter;

  get cssVars(): Record<string, string> {
    return themeToCssVars(resolveTheme(this.theme));
  }

  ngOnInit(): void {
    this.initAdapter();
    if (this.mode === "mailbox") {
      this.loadMailbox();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["baseURL"] || changes["token"] || changes["adapter"]) {
      this.initAdapter();
    }
    if (this.mode === "mailbox") {
      this.loadMailbox();
    }
  }

  private initAdapter(): void {
    const client = new ApiClient(
      this.baseURL,
      this.token ? { type: "Bearer", token: this.token } : undefined
    );
    this._adapter = createDefaultAdapter(client);
  }

  private loadMailbox(): void {
    if (!this._adapter) {
      this.initAdapter();
    }
    this.loading = true;
    this.errorMessage = null;
    this._adapter
      .mailbox()
      .then((result) => {
        this.emails = result.items;
      })
      .catch((err: Error) => {
        this.errorMessage = err.message;
        this.error.emit(err);
      })
      .finally(() => {
        this.loading = false;
      });
  }
}
