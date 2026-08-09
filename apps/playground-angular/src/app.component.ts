import { Component } from "@angular/core";
import { EmailAutomationWidgetComponent } from "@eaw/angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [EmailAutomationWidgetComponent],
  template: `
    <div class="page">
      <h1>Monorepo Playground — Angular</h1>
      <div class="card">
        <eaw-email-automation-widget
          baseURL="http://localhost:8000/api"
          token="test_token_123"
          mode="mailbox"
        ></eaw-email-automation-widget>
      </div>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 40px;
        background-color: #f3f4f6;
        min-height: 100vh;
      }
      .card {
        max-width: 800px;
        margin: 0 auto;
        background-color: #fff;
        border-radius: 8px;
      }
    `,
  ],
})
export class AppComponent {}
