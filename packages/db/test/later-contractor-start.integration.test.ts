// LATER-B10: new coverage only; no merged test or expectation changes.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository } from "../src/contractor-repository.js";
import { contractorSessionContext } from "../src/contractor-session-context.js";
import { withTenant, type VerifiedTenantContext } from "../src/tenant-context.js";
import { cluster, type Cluster } from "./extra-fixtures.js";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("[L037] concurrent start checks every returned session and tenant, new identities, isolation and revocation", async () => {
  const repo = new ContractorRepository(c.runtime), sessions = [randomUUID(), randomUUID(), randomUUID()];
  const requests = sessions.flatMap(session => [session, session]);
  const members = await Promise.all(requests.map(session => repo.startPractice(session)));
  expect(new Set(members.map(member => member.tenantId)).size).toBe(sessions.length);
  expect(new Set(members.map(member => member.identityUserId)).size).toBe(sessions.length);
  expect(new Set(members.map(member => member.membershipId)).size).toBe(sessions.length);
  for (let i = 0; i < requests.length; i++) {
    const session = requests[i]!, member = members[i]!;
    expect(await repo.resolveSession(session)).toEqual(member);
    expect(member).toEqual(members[i - i % 2]);
    const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, session);
    expect(context.tenantId).toBe(member.tenantId);
    const expected = (await c.admin.query("SELECT id,tenant_id FROM app.org_unit WHERE tenant_id=$1 ORDER BY id", [member.tenantId])).rows;
    expect(expected.length).toBeGreaterThan(0);
    await withTenant(c.runtime, context, async db => {
      expect((await db.$client.query("SELECT id,tenant_id FROM app.org_unit ORDER BY id")).rows).toEqual(expected);
      for (const other of members.filter(other => other.tenantId !== member.tenantId)) {
        expect((await db.$client.query("SELECT id FROM app.org_unit WHERE tenant_id=$1", [other.tenantId])).rows).toEqual([]);
      }
    });
    const view = await repo.query(member, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "organisation" });
    expect(view.tenantId).toBe(member.tenantId);
    expect(view.membershipId).toBe(member.membershipId);
  }
  // Revoke every newly returned identity, not merely a fixture's original tenant.
  for (let i = 0; i < members.length; i += 2) {
    const member = members[i]!;
    const view = await repo.query(member, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "organisation" });
    await repo.command(member, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId: member.membershipId });
  }
  for (let i = 0; i < requests.length; i++) {
    const member = members[i]!;
    expect(await repo.resolveSession(requests[i]!)).toEqual(member);
    await expect(repo.query(member, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "contracts" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});
