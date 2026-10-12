import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContractorRepository } from "../src/contractor-repository.js";
import { contractorSessionContext } from "../src/contractor-session-context.js";
import { withTenant } from "../src/tenant-context.js";
import { cluster, type Cluster } from "./extra-fixtures.js";

// Real PostgreSQL boundary tests; NOT RUN in the builder sandbox.
let database: Cluster;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  database = await cluster();
}, 120000);
afterAll(async () => { await database?.close(); vi.unstubAllEnvs(); });
async function practice() {
  const session = randomUUID();
  const member = await new ContractorRepository(database.runtime).startPractice(session);
  return { session, member };
}
describe("contractor session PostgreSQL boundary tests", () => {
  it("[D1] reads only the persisted session tenant's real organisation rows", async () => {
    const a = await practice(), b = await practice();
    for (const [own, other] of [[a, b], [b, a]] as const) {
      const context = await contractorSessionContext(database.runtime, own.session);
      expect(context.tenantId).toBe(own.member.tenantId);
      const expected = (await database.admin.query("SELECT id,tenant_id FROM app.org_unit WHERE tenant_id=$1 ORDER BY id", [own.member.tenantId])).rows;
      expect(expected.length).toBeGreaterThan(0);
      await withTenant(database.runtime, context, async db => {
        expect((await db.$client.query("SELECT id,tenant_id FROM app.org_unit ORDER BY id")).rows).toEqual(expected);
        expect((await db.$client.query("SELECT id FROM app.org_unit WHERE tenant_id=$1", [other.member.tenantId])).rows).toEqual([]);
      });
    }
  });
  it("[D2] refuses an unknown uuid and never exchanges tenants between sessions", async () => {
    await expect(contractorSessionContext(database.runtime, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const a = await practice(), b = await practice();
    expect(a.member.tenantId).not.toBe(b.member.tenantId);
    for (const [own, other] of [[a, b], [b, a]] as const) {
      const context = await contractorSessionContext(database.runtime, own.session);
      expect(context.tenantId).toBe(own.member.tenantId); expect(context.tenantId).not.toBe(other.member.tenantId);
    }
  });
  it("[D3] attributes a revoked member to the session tenant without granting query authority", async () => {
    const { session, member } = await practice();
    await database.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [member.tenantId, member.membershipId]);
    const context = await contractorSessionContext(database.runtime, session);
    expect(context.tenantId).toBe(member.tenantId);
    await expect(new ContractorRepository(database.runtime).query(member, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "contracts" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
