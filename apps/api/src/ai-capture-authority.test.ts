import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FixtureAiProvider } from "@jobguard/ai";
import { MemoryAuthProvider } from "./auth/auth-provider.js";
import { AiCaptureAuthority, createAiSessionResolver } from "./ai-capture-authority.js";

const id = "00000000-0000-4000-8000-000000000001";
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function setup() {
  let now = 1000;
  const identity = new MemoryAuthProvider("fixture-secret", () => {}, () => now, () => "12345678");
  await identity.requestCode({ email: "builder@example.test", purpose: "signup", ip: "127.0.0.1" });
  const session = await identity.verifyCode("builder@example.test", "signup", "12345678");
  const membership = identity.fixtureMemberships()[0]!;
  const credentials = { ...session, requestedTenantId: membership.tenantId, origin: "https://example.test" };
  const row = { id, tenant_id: membership.tenantId, content_text: "Stored capture", sha256: digest("Stored capture"), visibility: "public" };
  const captureRows = vi.fn(() => [row]);
  const query = vi.fn(async (sql: string) => {
    if (sql === "SELECT app.current_actor() actor, app.current_tenant() tenant") {
      return { rows: [{ actor: membership.id, tenant: membership.tenantId }] };
    }
    return { rows: sql.includes("FROM app.capture_source") ? captureRows() : [] };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  const provider = new FixtureAiProvider({ capture: { output: { ok: true }, citations: [{ sourceId: id, start: 0, end: 14 }] } });
  const execute = vi.spyOn(provider, "execute");
  const authority = new AiCaptureAuthority(pool, provider, createAiSessionResolver(identity, () => credentials, "https://example.test"));
  const request = { contractVersion: "ai_gateway_request_v1", fixtureId: "capture", operation: "capture_job_record_proposal",
    promptVersion: "test", schemaVersion: "test", timeoutMs: 1000, maxOutputTokens: 128,
    sources: [{ id, tenantId: membership.tenantId, visibility: "public", content: "Caller text", sha256: digest("Caller text") }] };
  return { identity, membership, credentials, row, captureRows, query, pool, execute, authority, request, expire: () => { now += 86_400_001; } };
}
const output = z.object({ ok: z.boolean() });
describe("stored capture AI authority (fake provider; no live route)", () => {
  it("uses persisted bytes, hash, tenant and visibility rather than request labels", async () => {
    const s = await setup();
    Object.assign(s.request.sources[0]!, { tenantId: "forged", visibility: "hidden" });
    const result = await s.authority.generate(s.request, output);
    expect(result.output).toEqual({ ok: true });
    expect(s.execute.mock.calls[0]![0].sources).toEqual([{ id, tenantId: s.membership.tenantId,
      visibility: "public", content: "Stored capture", sha256: digest("Stored capture") }]);
    expect(s.query).toHaveBeenCalledWith(expect.stringContaining("FROM app.capture_source WHERE tenant_id=$1 AND id=$2"), [s.membership.tenantId, id]);
  });
  it.each(["other tenant", "wrong visibility", "missing source", "corrupt hash"])("refuses %s before provider execution", async scenario => {
    const s = await setup();
    if (scenario === "other tenant") s.row.tenant_id = "another-tenant";
    if (scenario === "wrong visibility") s.row.visibility = "hidden";
    if (scenario === "missing source") s.captureRows.mockReturnValue([]);
    if (scenario === "corrupt hash") s.row.sha256 = "0".repeat(64);
    await expect(s.authority.generate(s.request, output)).rejects.toMatchObject({ code: "invalid_request" });
    expect(s.captureRows).toHaveBeenCalledTimes(1);
    expect(s.execute).not.toHaveBeenCalled();
  });
  it.each(["revoked member", "missing session", "expired session", "wrong tenant"])("refuses %s before storage or provider execution", async scenario => {
    const s = await setup();
    if (scenario === "revoked member") s.identity.revoke(s.membership.id);
    if (scenario === "missing session") s.credentials.sessionToken = "";
    if (scenario === "expired session") s.expire();
    if (scenario === "wrong tenant") s.credentials.requestedTenantId = id;
    await expect(s.authority.generate(s.request, output)).rejects.toMatchObject({ code: "invalid_request" });
    expect(s.pool.connect).not.toHaveBeenCalled();
    expect(s.execute).not.toHaveBeenCalled();
  });
  it("rechecks membership after loading sources", async () => {
    const s = await setup();
    s.captureRows.mockImplementation(() => {
      s.identity.revoke(s.membership.id);
      return [s.row];
    });
    await expect(s.authority.generate(s.request, output)).rejects.toMatchObject({ code: "invalid_request" });
    expect(s.captureRows).toHaveBeenCalledTimes(1);
    expect(s.execute).not.toHaveBeenCalled();
  });
});
