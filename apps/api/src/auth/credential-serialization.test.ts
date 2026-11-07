import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { IdentityRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "./persisted-auth-provider.js";

it("keeps the authenticated persisted credential available to the bridge and out of JSON/copies", async () => {
  const sessionId = randomUUID(), userId = randomUUID(), token = "fictional-session-token-never-used-remotely";
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT id,user_id,csrf_token FROM identity.session")) return { rows: [{ id: sessionId, user_id: userId, csrf_token: "fictional-csrf" }] };
    if (sql === "SELECT identity.sso_session_scope($1) scope") return { rows: [{ scope: null }] };
    throw new Error("Unexpected authentication query");
  });
  const provider = new PersistedAuthProvider(new IdentityRepository({ query } as unknown as Pool), "fictional-hmac-secret-at-least-32-bytes");
  const principal = (await provider.authenticate(token))!, credential = provider.digest(`session:${token}`);
  expect(principal).toMatchObject({ sessionId, identityUserId: userId, csrfToken: "fictional-csrf" });
  expect(principal.sessionCredential).toBe(credential);
  expect(JSON.stringify(principal)).not.toContain(credential);
  expect(JSON.stringify(principal)).not.toContain("sessionCredential");
  expect({ ...principal }).not.toHaveProperty("sessionCredential");
  expect(Object.getOwnPropertyDescriptor(principal, "sessionCredential")).toMatchObject({ enumerable: false, writable: false, configurable: false });
});
