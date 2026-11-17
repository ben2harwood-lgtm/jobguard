import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The demo reads persisted state dynamically; no paid cache bindings are needed.
export default {
  ...defineCloudflareConfig({}),
  // Share server chunks in the Worker; the normal Next/Vercel build is unchanged.
  buildCommand: "pnpm exec next build --webpack",
};
