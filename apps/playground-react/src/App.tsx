import { EmailAutomationWidget } from "../../../packages/react/src/index";

function App() {
  return (
    <div
      style={{
        padding: "40px",
        backgroundColor: "#f3f4f6",
        minHeight: "100vh",
      }}
    >
      <h1>Monorepo Playground</h1>
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          backgroundColor: "#fff",
          borderRadius: "8px",
        }}
      >
        <EmailAutomationWidget
          baseURL="http://localhost:8000/api"
          token="test_token_123"
          mode="mailbox"
        />
      </div>
    </div>
  );
}

export default App;
