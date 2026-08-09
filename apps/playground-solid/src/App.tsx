import { EmailAutomationWidget } from "@eaw/solid";

export default function App() {
  return (
    <div class="page">
      <h1>Monorepo Playground — Solid</h1>
      <div class="card">
        <EmailAutomationWidget
          baseURL="http://localhost:8000/api"
          token="test_token_123"
          mode="mailbox"
        />
      </div>
    </div>
  );
}
