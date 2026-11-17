import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { encodeWorkOrderCsv, referenceApprovalRulesV1, type WorkOrderSampleId } from "@jobguard/core";
import { ContractorPartyRepository } from "./contractor-party-repository.js";
import { ContractorRepository } from "./contractor-repository.js";
import { SorRepository } from "./sor-repository.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "./tenant-context.js";

/**
 * Generated, fictional fixtures for ENT-2 (C3): the demo organisation's housing association, contract, schedule of rates, sites and operative,
 * and the selectable `work-order-import.v1` files. Everything goes through the existing ENT-1 / CH-3b commands or the runtime role's own
 * INSERT rights on party records; no migration-owner access, no real data, nothing is sent.
 */
export const demoClientName = "Fictional Housing Association";
export const demoSorItems = [
  { code: "REPAIR-DOOR", description: "Repair internal door", unit: "each", ratePence: 10000 },
  { code: "PAINT-ROOM", description: "Paint room, two coats", unit: "room", ratePence: 25000 },
  { code: "FIT-LOCK", description: "Fit mortice lock", unit: "each", ratePence: 4500 },
  { code: "CLEAR-VOID", description: "Clear void property", unit: "each", ratePence: 18000 },
  { code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre", ratePence: 350 },
] as const;
export type WorkOrderDemo = {
  clientId: string; contractId: string; contractVersionId: string; scheduleId: string; sorVersionId: string; siteRevisionIds: string[]; teamId: string; branchId: string; operativeMembershipId: string;
  adjustment: { numerator: string; denominator: string }; issuedOn: string;
};
const contractDocument = (sorVersionId: string) => ({ version: "client-contract.v1", reference: "FICTIONAL-HA-2026", startsOn: "2026-01-01", endsOn: null, sorVersionIds: [sorVersionId], tenderedAdjustment: { numerator: "-35", denominator: "1000" }, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 });

/** Idempotent per organisation; safe to call from two browsers at once (one tenant-level session lock). */
export async function prepareWorkOrderDemo(pool: Pool, principal: AuthenticatedMembership, options: { siteCount?: number } = {}): Promise<WorkOrderDemo> {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtextextended($1,56))", [principal.tenantId]);
    const contractors = new ContractorRepository(pool), parties = new ContractorPartyRepository(pool), rates = new SorRepository(pool);
    const view = () => contractors.query(principal, { version: "contractor-query.v1", tenantId: principal.tenantId, resource: "organisation" });
    const command = async (fields: Record<string, unknown>) => contractors.command(principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view()).revision, ...fields });
    const organisation = await view();
    const team = organisation.teams[0]!;
    const existing = organisation.clients.find(client => client.name === demoClientName);
    const siteCount = options.siteCount ?? 5;
    if (existing) {
      const contracts = await contractors.query(principal, { version: "contractor-query.v1", tenantId: principal.tenantId, resource: "contracts" });
      const version = contracts.contracts.filter(c => c.client_id === existing.id).at(-1)!;
      const document = version.document as ReturnType<typeof contractDocument>;
      const stored = await withTenant(pool, verifiedTenantContextFromMembership(principal), async db => ({
        sites: (await db.$client.query<{ id: string }>("SELECT id FROM app.site_revision WHERE payload->'addressLines'->>0 LIKE '% Fictional Demo Street' ORDER BY created_at,id")).rows.map(r => r.id),
        operative: (await db.$client.query<{ membership_id: string }>("SELECT membership_id FROM app.contractor_member WHERE email='demo.operative@fictional.invalid'")).rows[0]?.membership_id,
        sor: (await db.$client.query<{ schedule_id: string }>("SELECT schedule_id FROM app.sor_version WHERE id=$1", [document.sorVersionIds[0]])).rows[0]?.schedule_id,
      }));
      // A half-prepared organisation is never guessed at: the caller sees the generic retryable failure.
      if (stored.sites.length === 0 || !stored.operative || !stored.sor) throw new Error("The generated demo organisation is incomplete");
      return { clientId: existing.id, contractId: version.contract_id, contractVersionId: version.id, scheduleId: stored.sor!, sorVersionId: document.sorVersionIds[0]!, siteRevisionIds: stored.sites, teamId: team.id, branchId: team.branch_id, operativeMembershipId: stored.operative!, adjustment: document.tenderedAdjustment, issuedOn: "2026-10-08" };
    }
    const scheduleId = randomUUID();
    const sor = await rates.importVersion(principal, { version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId, reference: "Fictional schedule of rates 2026", effectiveFrom: "2026-01-01",
      items: demoSorItems.map(item => ({ code: item.code, description: item.description, unit: item.unit, rate: { pence: item.ratePence, currency: "GBP" } })) });
    const clientId = (await command({ kind: "client.create", branchId: team.branch_id, name: demoClientName, clientType: "housing_association" })).id;
    const contractId = randomUUID();
    const contractVersionId = (await command({ kind: "contract.revise", clientId, contractId, document: contractDocument(sor.versionId), rules: referenceApprovalRulesV1 })).id;
    const siteRevisionIds: string[] = [];
    const customerRevisionId = randomUUID();
    await withTenant(pool, verifiedTenantContextFromMembership(principal), async db => {
      const customerId = randomUUID();
      await db.$client.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [principal.tenantId, customerId]);
      await db.$client.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4::jsonb)", [principal.tenantId, customerRevisionId, customerId, JSON.stringify({ version: "customer.v1", name: demoClientName, type: "housing_association", email: "lettings@fictional.invalid" })]);
      for (let index = 1; index <= siteCount; index++) {
        const siteId = randomUUID(), revisionId = randomUUID();
        await db.$client.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [principal.tenantId, siteId]);
        await db.$client.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4::jsonb,'[]')", [principal.tenantId, revisionId, siteId, JSON.stringify({ version: "site.v1", addressLines: [`${index} Fictional Demo Street`], town: "London", postcode: "SW1A 1AA" })]);
        siteRevisionIds.push(revisionId);
      }
    });
    await parties.linkCustomer(principal, clientId, { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: randomUUID(), customerRevisionId });
    const operativeMembershipId = (await command({ kind: "member.invite", role: "operative", email: "demo.operative@fictional.invalid", scope: { kind: "team", id: team.id }, clientId: null, contractId: null })).id;
    return { clientId, contractId, contractVersionId, scheduleId, sorVersionId: sor.versionId, siteRevisionIds, teamId: team.id, branchId: team.branch_id, operativeMembershipId, adjustment: { numerator: "-35", denominator: "1000" }, issuedOn: "2026-10-08" };
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,56))", [principal.tenantId]).catch(() => undefined);
    lock.release();
  }
}

/**
 * ENT-2 attempt 3: a SECOND client in a SECOND branch of the same organisation, for the per-order authority tests. Built only through the existing
 * ENT-1 / CH-3b commands (and the runtime role's own INSERT rights on party records, as prepareWorkOrderDemo does). It shares the demo's schedule of
 * rates and site records (tenant data, not one client's) and gets its own branch, team, client, contract and customer link; the branch is created under
 * `regionId` (default: the organisation's first region). The returned object is a WorkOrderDemo for the second client: build its rows with
 * `assignedMembershipIds: []`, because the demo operative belongs to the first branch's team.
 */
export async function addBranchClient(pool: Pool, principal: AuthenticatedMembership, demo: WorkOrderDemo, label = "Second", regionId?: string): Promise<WorkOrderDemo> {
  const contractors = new ContractorRepository(pool), parties = new ContractorPartyRepository(pool);
  const view = () => contractors.query(principal, { version: "contractor-query.v1", tenantId: principal.tenantId, resource: "organisation" });
  const command = async (fields: Record<string, unknown>) => contractors.command(principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view()).revision, ...fields });
  const region = regionId ?? (await view()).units.find(unit => unit.kind === "region")!.id;
  const branchId = (await command({ kind: "unit.create", unitKind: "branch", parentId: region, name: `Fictional ${label} branch` })).id;
  const teamId = (await command({ kind: "team.create", branchId, name: `Fictional ${label} branch team` })).id;
  const name = `Fictional ${label} Housing Association`;
  const clientId = (await command({ kind: "client.create", branchId, name, clientType: "housing_association" })).id;
  const contractId = randomUUID();
  const document = { ...contractDocument(demo.sorVersionId), reference: `FICTIONAL-${label.toUpperCase()}-2026`, tenderedAdjustment: demo.adjustment };
  const contractVersionId = (await command({ kind: "contract.revise", clientId, contractId, document, rules: referenceApprovalRulesV1 })).id;
  const customerRevisionId = randomUUID();
  await withTenant(pool, verifiedTenantContextFromMembership(principal), async db => {
    const customerId = randomUUID();
    await db.$client.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [principal.tenantId, customerId]);
    await db.$client.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4::jsonb)", [principal.tenantId, customerRevisionId, customerId, JSON.stringify({ version: "customer.v1", name, type: "housing_association", email: "lettings@fictional.invalid" })]);
  });
  await parties.linkCustomer(principal, clientId, { version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: randomUUID(), customerRevisionId });
  return { ...demo, clientId, contractId, contractVersionId, teamId, branchId };
}

type Row = Record<string, unknown>;
const pad = (n: number, width = 4) => String(n).padStart(width, "0");
/** A clean fictional order; every field can be overridden. The resident is a deliberately recognisable canary for the privacy tests. */
export function demoRow(demo: WorkOrderDemo, n: number, overrides: Row = {}): Row {
  const priorities = ["routine", "urgent", "emergency"] as const;
  return {
    version: "work-order-import.v1", clientId: demo.clientId, contractId: demo.contractId, workOrderReference: `WO-DEMO-${pad(n)}`, issuedOn: demo.issuedOn, dueOn: "2026-10-22", priority: priorities[n % 3], status: "ordered", expectedRevision: 0,
    siteRevisionId: demo.siteRevisionIds[n % demo.siteRevisionIds.length] ?? null,
    resident: { kind: "contact", contact: { version: "resident-contact.v1", name: `Fictional Resident ${pad(n)}`, phone: `0000${pad(n, 6)}`, email: `resident${pad(n)}@resident-canary.invalid` } },
    teamId: demo.teamId, assignedMembershipIds: [demo.operativeMembershipId],
    lines: [
      { clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1" },
      { clientLineReference: "L2", sorCode: demoSorItems[1 + (n % 3)]!.code, quantity: n % 2 ? "2" : "0.5" },
    ],
    ...overrides,
  };
}
export const demoFile = (rows: readonly Row[]) => encodeWorkOrderCsv(rows);
/** The selectable generated files offered by the office screen and used by the browser spec. */
export function generateWorkOrderSample(sample: WorkOrderSampleId, demo: WorkOrderDemo): string {
  if (sample === "starter_orders") return demoFile([1, 2, 3, 4, 5].map(n => demoRow(demo, n)));
  if (sample === "orders_with_errors") {
    const bad = (n: number, lines: Row[], extra: Row = {}) => demoRow(demo, n, { workOrderReference: `WO-DEMO-E${pad(n, 3)}`, lines, ...extra });
    return demoFile([
      bad(1, [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1" }]),
      bad(2, [{ clientLineReference: "L1", sorCode: "NO-SUCH-CODE", quantity: "1" }]),
      bad(3, [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1.1234567" }]),
      bad(4, [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1" }], { siteRevisionId: null }),
      bad(5, [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "-1" }]),
      bad(6, [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "999999999999" }]),
      bad(7, [{ clientLineReference: "L1", sorCode: "PAINT-ROOM", quantity: "2" }]),
    ]);
  }
  const changed = demoRow(demo, 1, { expectedRevision: 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "3" }, { clientLineReference: "L2", sorCode: demoSorItems[2]!.code, quantity: "2" }] });
  const reprioritised = demoRow(demo, 2, { expectedRevision: 1, priority: "routine", lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1" }, { clientLineReference: "L2", sorCode: demoSorItems[3]!.code, quantity: "2" }, { clientLineReference: "L3", sorCode: "FIT-LOCK", quantity: "1" }] });
  return demoFile([changed, reprioritised, demoRow(demo, 3, { expectedRevision: 1, status: "cancelled", lines: [] }), demoRow(demo, 4, { expectedRevision: 1 })]);
}
