import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { UserCommandDispatcher } from "./commands.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const tenant = "81000000-0000-4000-8000-000000000001";
const member = "84000000-0000-4000-8000-000000000001";
const id = "87000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(tenant);
const canonical = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(canonical).join(",")}]`
  : `{${Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
function expiredReplayPool(raw: Record<string, unknown>, dismissal = false) {
  const { commandId: _id, decisionId: _decision, resolutionId: _resolution, authorizationId: _auth, ...rest } = raw;
  const hash = createHash("sha256").update(canonical(dismissal ? raw : rest)).digest("hex");
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("app.membership")) return { rows: [], rowCount: 0 };
    if (sql.includes("INSERT INTO app.command_receipt")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT request_hash")) return { rows: [{ request_hash: hash, status: "succeeded", result: { private: "stored-result" } }], rowCount: 1 };
    throw new Error(`Unexpected statement: ${sql}`);
  });
  const client = { query: vi.fn(async (sql: string, values?: unknown[]) => /^(BEGIN|COMMIT|ROLLBACK)$|set_config/.test(sql) ? { rows: [] } : query(sql, values)), release: vi.fn() };
  return { pool: { connect: vi.fn(async () => client) } as unknown as Pool, query };
}
describe("LP-5a named replay regressions", () => {
  it.each(["revoked", "expired"])("dispatch without a lock refuses a %s owner's stored result", async () => {
    const raw = { version: "command.v1", commandId: id, commandType: "job.switch_live", semanticKey: "replay", actorMembershipId: member,
      subjectType: "job", subjectRef: id, action: { actionType: "job.switch_live", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
        amountPence: null, currency: null, policyVersion: "v1", expiresAt: new Date("2099-01-01Z") } };
    const { pool } = expiredReplayPool(raw), mutate = vi.fn();
    await expect(new UserCommandDispatcher(pool).dispatch(context, raw, { mutate })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("dismissDecision checks its owner before returning a stored result", async () => {
    const raw = { version: "decision-resolution-command.v1", commandId: id, semanticKey: "dismiss", actorMembershipId: member,
      decisionId: id, findingFingerprint: "a".repeat(64), resolution: "dismissed", expectedSnapshotRevision: 1 };
    const { pool } = expiredReplayPool(raw, true);
    await expect(new UserCommandDispatcher(pool).dismissDecision(context, raw)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
