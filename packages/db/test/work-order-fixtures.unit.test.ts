import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractorRepository, type ContractorView } from "../src/contractor-repository.js";
import { ContractorPartyRepository } from "../src/contractor-party-repository.js";
import { SorRepository } from "../src/sor-repository.js";
import { demoClientName, generateWorkOrderSample, prepareWorkOrderDemo } from "../src/work-order-fixtures.js";
import type { AuthenticatedMembership } from "../src/tenant-context.js";

const sequence = vi.hoisted(() => ({ value: 0 }));
vi.mock("node:crypto", async importOriginal => ({ ...await importOriginal<typeof import("node:crypto")>(), randomUUID: () => `ffffffff-ffff-4fff-8fff-${String(999999999999 - sequence.value++).padStart(12, "0")}` }));
afterEach(() => vi.restoreAllMocks());

/** Stateful adapter double: proves preparation control flow, not PostgreSQL/RLS or import persistence. */
function fixture() {
  const principal = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
  const team = { id: randomUUID(), branch_id: randomUUID(), name: "Fictional team" };
  const view = { revision: 0, teams: [team], clients: [], contracts: [] } as unknown as ContractorView;
  const sites: Array<{ id: string; address: string; revision: number }> = [];
  const customers: Array<{ id: string }> = [];
  const sor: Array<{ id: string; schedule_id: string }> = [];
  let operative: string | undefined, link: string | undefined;
  const command = vi.spyOn(ContractorRepository.prototype, "command").mockImplementation(async (_p, raw) => {
    const c = raw as Record<string, any>;
    if (c.kind === "client.create") view.clients.push({ id: c.id, name: c.name, branch_id: c.branchId });
    else if (c.kind === "contract.revise") view.contracts.push({ id: c.id, contract_id: c.contractId, client_id: c.clientId, revision: 1, document: c.document, rule_version_id: randomUUID(), rules: c.rules });
    else if (c.kind === "member.invite") operative = c.id;
    else throw new Error(`Unexpected command ${c.kind}`);
    return { id: c.id, revision: ++view.revision, kind: c.kind, environment: "synthetic_demo", realExternalActions: 0 };
  });
  vi.spyOn(ContractorRepository.prototype, "query").mockImplementation(async () => view);
  vi.spyOn(SorRepository.prototype, "importVersion").mockImplementation(async (_p, raw) => {
    const c = raw as { scheduleId: string };
    const row = { id: randomUUID(), schedule_id: c.scheduleId }; sor.push(row);
    return { version: "sor-version-result.v1", environment: "synthetic_demo", versionId: row.id, scheduleId: row.schedule_id, itemCount: 5, effectiveFrom: "2026-01-01", replayed: false, realExternalActions: 0 };
  });
  vi.spyOn(ContractorPartyRepository.prototype, "linkCustomer").mockImplementation(async (_p, _client, raw) => {
    link = (raw as { customerRevisionId: string }).customerRevisionId;
    return { version: "contractor-party-result.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), replayed: false, realExternalActions: 0 } as never;
  });
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT (set_config|pg_advisory))/u.test(sql)) return { rows: [] };
    if (sql.startsWith("INSERT INTO app.customer_revision")) customers.push({ id: params[1] });
    else if (sql.startsWith("INSERT INTO app.site_revision")) sites.push({ id: params[1], address: JSON.parse(params[3]).addressLines[0], revision: 1 });
    else if (/^INSERT INTO app\.(customer|site)\(/u.test(sql)) { /* identity insert */ }
    else if (sql.includes("FROM app.site_revision")) return { rows: [...sites].sort((a, b) => sql.includes("ORDER BY created_at,id") ? a.id.localeCompare(b.id) : a.address.localeCompare(b.address)) };
    else if (sql.includes("FROM app.contractor_member")) return { rows: operative ? [{ membership_id: operative }] : [] };
    else if (sql.includes("FROM app.contractor_client_customer")) return { rows: link ? [{ customer_revision_id: link }] : [] };
    else if (sql.includes("FROM app.customer_revision")) return { rows: customers };
    else if (sql.includes("FROM app.sor_version")) return { rows: sor.map(s => ({ ...s, version_id: s.id })) };
    else throw new Error(`Unexpected SQL: ${sql}`);
    return { rows: [] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { pool, principal, view, sites, customers, sor, command, hasLink: () => !!link };
}

describe("generated demo preparation audit reproducers (unit adapter only)", () => {
  it("generated samples retain site bindings across preparation and replay", async () => {
    const f = fixture();
    const first = await prepareWorkOrderDemo(f.pool, f.principal);
    expect(first.siteRevisionIds).toEqual([...first.siteRevisionIds].sort().reverse());
    const csv = generateWorkOrderSample("starter_orders", first);
    const before = [f.view.revision, f.sites.length, f.customers.length, f.sor.length];
    for (let retry = 0; retry < 2; retry++) {
      const again = await prepareWorkOrderDemo(f.pool, f.principal);
      expect(generateWorkOrderSample("starter_orders", again)).toBe(csv);
      expect(generateWorkOrderSample("revised_orders", again)).toBe(generateWorkOrderSample("revised_orders", first));
    }
    expect([f.view.revision, f.sites.length, f.customers.length, f.sor.length]).toEqual(before);
  });

  it("generated import resumes after interrupted preparation", async () => {
    const f = fixture(), committed = f.command.getMockImplementation()!;
    let fail = true;
    f.command.mockImplementation(async (p, raw) => {
      if ((raw as { kind: string }).kind === "contract.revise" && fail) { fail = false; throw new Error("injected temporary contract failure"); }
      return committed(p, raw);
    });
    await expect(prepareWorkOrderDemo(f.pool, f.principal)).rejects.toThrow("injected temporary contract failure");
    expect(f.view.clients.filter(c => c.name === demoClientName)).toHaveLength(1);
    const recovered = await prepareWorkOrderDemo(f.pool, f.principal);
    expect(recovered.siteRevisionIds).toHaveLength(5);
    expect(f.view.clients).toHaveLength(1);
    expect(f.view.contracts).toHaveLength(1);
    expect(f.sor).toHaveLength(1);
    expect(f.customers).toHaveLength(1);
    expect(f.hasLink()).toBe(true);
    expect(recovered.operativeMembershipId).toBeTruthy();
  });
});
