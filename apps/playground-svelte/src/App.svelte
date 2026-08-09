<script lang="ts">
  import { EmailAutomationWidget } from "@eaw/svelte";
</script>

<div class="page">
  <h1>Monorepo Playground — Svelte</h1>
  <div class="card">
    <EmailAutomationWidget baseURL="http://localhost:8000/api" token="test_token_123" mode="mailbox" />
  </div>
</div>

<style>
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
</style>
