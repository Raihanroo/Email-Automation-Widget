import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
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
 * `<eaw-email-automation-widget>` — the Angular standalone-component
 * wrapper around the Core SDK. Mirrors `@eaw/react` and `@eaw/vue`
 * behaviour exactly; only the rendering layer (Angular template)
 * differs.
 *
 * Usage:
 *   <eaw-email-automation-widget
 *     mode="mailbox"
 *     baseURL="/api"
 *     [token]="token"
 *     (error)="onError($event)"
 *   ></eaw-email-automation-widget>
 */
@Component({
  selector: "eaw-email-automation-widget",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="eaw-root" [attr.data-layout]="layout" [ngStyle]="cssVars">
      <h2 style="margin:0 0 12px;font-size:18px;">Email Automation Widget</h2>

      <ng-container *ngIf="mode === 'mailbox'; else dashboardTpl">
        <p *ngIf="loading">Loading mailbox…</p>
        <p
          *ngIf="!loading && errorMessage"
          style="color:var(--eaw-color-danger);"
        >
          {{ errorMessage }}
        </p>
        <ul
          *ngIf="!loading && !errorMessage"
          style="list-style:none;margin:0;padding:0;"
        >
          <li
            *ngFor="let mail of emails"
            style="padding:8px 0;border-bottom:1px solid var(--eaw-color-border);"
          >
            <strong>{{ mail.subject }}</strong>
            <span style="color:var(--eaw-color-text-secondary);">
              — {{ mail.from }}</span
            >
          </li>
          <li *ngIf="emails.length === 0">No messages yet.</li>
        </ul>
      </ng-container>

      <ng-template #dashboardTpl>
        <p
          *ngIf="mode === 'dashboard'"
          style="color:var(--eaw-color-text-secondary);"
        >
          Dashboard content coming in a later milestone.
        </p>
      </ng-template>
    </div>
  `,
  styles: [
    `
      .eaw-root {
        padding: 20px;
        border: 1px solid var(--eaw-color-border, #e5e7eb);
        border-radius: var(--eaw-radius, 8px);
        background: var(--eaw-color-bg, #fff);
        color: var(--eaw-color-text-primary, #111827);
        font-family: var(--eaw-font-family, sans-serif);
      }
    `,
  ],
})
export class EmailAutomationWidgetComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() mode: WidgetMode = "dashboard";
  @Input() layout: "full" | "embedded" = "full";
  @Input() theme?: Partial<WidgetTheme>;
  @Input() baseURL = "/api";
  @Input() token?: string;

  @Output() emailSent = new EventEmitter<unknown>();
  @Output() error = new EventEmitter<Error>();

  emails: MailboxItem[] = [];
  loading = false;
  errorMessage: string | null = null;
  cssVars: Record<string, string> = {};

  private adapter!: EmailAdapter;
  private destroyed = false;

  ngOnInit(): void {
    this.rebuildAdapter();
    this.applyTheme();
    if (this.mode === "mailbox") void this.loadMailbox();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["baseURL"] || changes["token"]) {
      this.rebuildAdapter();
    }
    if (changes["theme"]) {
      this.applyTheme();
    }
    if (changes["mode"] && this.mode === "mailbox") {
      void this.loadMailbox();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  private rebuildAdapter() {
    const client = new ApiClient(
      this.baseURL,
      this.token ? { type: "Bearer", token: this.token } : undefined
    );
    this.adapter = createDefaultAdapter(client);
  }

  private applyTheme() {
    const resolved = resolveTheme(this.theme);
    this.cssVars = themeToCssVars(resolved);
  }

  private async loadMailbox() {
    this.loading = true;
    this.errorMessage = null;
    try {
      const result = await this.adapter.mailbox();
      if (!this.destroyed) this.emails = result.items;
    } catch (err) {
      if (this.destroyed) return;
      const message =
        err instanceof Error ? err.message : "Failed to load mailbox";
      this.errorMessage = message;
      this.error.emit(err instanceof Error ? err : new Error(message));
    } finally {
      if (!this.destroyed) this.loading = false;
    }
  }
}
