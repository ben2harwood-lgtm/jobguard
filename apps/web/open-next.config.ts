import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The demo reads persisted state dynamically; no paid cache bindings are needed.
export default defineCloudflareConfig({});
