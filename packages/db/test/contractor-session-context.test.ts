import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractorError } from "@jobguard/core";
import { ContractorRepository } from "../src/contractor-repository.js";
import * as tenantContext from "../src/tenant-context.js";
import type { AuthenticatedMembership } from "../src/tenant-context.js";
import * as bridge from "../src/contractor-session-context.js";

function recordingPool() {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }));
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { pool: { connect, query } as unknown as Pool, connect, query, release };
}
function membership(): AuthenticatedMembership {
  return { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
}
const source = () => readFileSync(new URL("../src/contractor-session-context.ts", import.meta.url), "utf8");
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("contractor session boundary tests", () => {
  it.each(["pilot_no_charge", "production_billing", "", undefined])("[B1] refuses mode %s before database access", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    const { pool, connect, query } = recordingPool();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession");
    await expect(bridge.contractorSessionContext(pool, randomUUID())).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    await expect(bridge.contractorSessionContext(pool, randomUUID())).rejects.toBeInstanceOf(ContractorError);
    expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "", "not-a-uuid", `${randomUUID()}extra`, 42, {}])("[B2] refuses invalid session %s before lookup", async session => {
    const { pool, connect, query } = recordingPool();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession");
    await expect(Reflect.apply(bridge.contractorSessionContext, undefined, [pool, session])).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it("[B3] propagates the exact unknown-session and database error objects", async () => {
    const { pool } = recordingPool();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession");
    for (const error of [new ContractorError("UNAUTHENTICATED"), new Error("database unavailable")]) {
      lookup.mockRejectedValueOnce(error);
      await expect(bridge.contractorSessionContext(pool, randomUUID())).rejects.toBe(error);
    }
  });
  it("[B4] returns the frozen stamped context and rejects a frozen look-alike before connecting", async () => {
    const member = membership(), { pool, connect, query, release } = recordingPool();
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
    const context = await bridge.contractorSessionContext(pool, randomUUID());
    expect(Object.isFrozen(context)).toBe(true);
    expect(Reflect.ownKeys(context)).toEqual(["tenantId"]); expect(context.tenantId).toBe(member.tenantId);
    await tenantContext.withTenant(pool, context, async () => undefined);
    expect(query.mock.calls).toEqual([["BEGIN"], ["SELECT set_config('app.tenant_id', $1, true)", [member.tenantId]], ["COMMIT"]]);
    expect(release).toHaveBeenCalledOnce(); connect.mockClear(); query.mockClear();
    await expect(Reflect.apply(tenantContext.withTenant, undefined, [pool, Object.freeze({ tenantId: member.tenantId }), async () => undefined]))
      .rejects.toBeInstanceOf(tenantContext.InvalidTenantContextError);
    expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it("[B5] performs one lookup with one argument and passes the exact member to the maker", async () => {
    const member = membership(), session = randomUUID(), { pool, connect, query } = recordingPool();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
    const maker = vi.spyOn(tenantContext, "verifiedTenantContextFromMembership");
    const context = await bridge.contractorSessionContext(pool, session);
    expect(lookup.mock.calls).toEqual([[session]]);
    expect(maker).toHaveBeenCalledExactlyOnceWith(member); expect(maker.mock.calls[0]![0]).toBe(member);
    expect(context).toBe(maker.mock.results[0]!.value);
    expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it("[B6] accepts two required parameters, ignores extra authority fields and exports only the bridge", async () => {
    const member = membership(), other = membership(), session = randomUUID(), { pool } = recordingPool();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
    expect(bridge.contractorSessionContext.length).toBe(2);
    for (const extra of [other.tenantId, other, { tenantId: other.tenantId, skipLookup: true }]) {
      const context = await Reflect.apply(bridge.contractorSessionContext, undefined, [pool, session, extra]);
      expect(context.tenantId).toBe(member.tenantId); expect(context.tenantId).not.toBe(other.tenantId);
    }
    expect(lookup.mock.calls).toEqual([[session], [session], [session]]);
    expect(Object.keys(bridge)).toEqual(["contractorSessionContext"]);
  });
  it("[B7] makes a fresh context on every call and has no keeper or module-level state", async () => {
    const { pool } = recordingPool(), session = randomUUID();
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(membership());
    expect(await bridge.contractorSessionContext(pool, session)).not.toBe(await bridge.contractorSessionContext(pool, session));
    const text = source(), parsed = ts.createSourceFile("bridge.ts", text, ts.ScriptTarget.Latest, true);
    expect(text).not.toMatch(/\b(?:let|var|class|WeakMap)\b|new\s+(?:Map|Set)\b/u);
    expect(parsed.statements.filter(ts.isVariableStatement)).toEqual([]);
    expect(text).not.toMatch(/\b(?:Object|Reflect|JSON)\s*\.|\bstructuredClone\b/u);
  });
  it("[B8] mirrors the single direct maker return and unaliased signature the scanner will review", () => {
    const text = source(), parsed = ts.createSourceFile("bridge.ts", text, ts.ScriptTarget.Latest, true);
    expect(text.match(/verifiedTenantContextFromMembership\(/gu)).toHaveLength(1);
    expect(text).not.toMatch(/\bas VerifiedTenantContext|verifiedTenantContextForQueuedJob|function\s+verifiedTenantContextFromMembership|(?:verifiedTenantContextFromMembership|VerifiedTenantContext)\s+as\s/u);
    expect(text).toContain("return verifiedTenantContextFromMembership(member);");
    expect(text).toContain("const member = await new ContractorRepository(pool).resolveSession(sessionId);");
    const casts: ts.Node[] = [];
    function inspect(node: ts.Node) {
      if (ts.isTypeAssertionExpression(node) || ts.isAsExpression(node)) casts.push(node);
      ts.forEachChild(node, inspect);
    }
    inspect(parsed); expect(casts).toEqual([]);
    const functions = parsed.statements.filter(ts.isFunctionDeclaration);
    expect(functions).toHaveLength(1);
    expect(functions[0]!.parameters.map(p => p.getText(parsed))).toEqual(["pool: Pool", "sessionId: string"]);
    expect(functions[0]!.type?.getText(parsed)).toBe("Promise<VerifiedTenantContext>");
    expect(text.charCodeAt(0)).not.toBe(0xfeff); expect(text).not.toMatch(/[^\x00-\x7f]|\r/u);
  });
});
