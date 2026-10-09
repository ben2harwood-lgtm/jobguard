import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { referenceApprovalRulesV1 } from "@jobguard/core";
import { ContractorPartyRepository, ContractorRepository, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type WorkOrderDemo } from "../src/index.js";

/**
 * ENT-2 attempt 3: a SECOND client in a SECOND branch of the same organisation, for the per-order authority tests.
 * Built only through the existing ENT-1 / CH-3b commands (and the runtime role's own INSERT rights on party records, as the demo fixture does).
 * It shares the demo's schedule of rates and site records (those are tenant data, not one client's) and gets its own branch, team, client,
 * contract and customer link; the branch is created under `regionId` (default: the organisation's first region). The returned object is a WorkOrderDemo for the second client: build its rows with `assignedMembershipIds: []`,
 * because the demo operative belongs to the first branch's team.
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
  const document = { version: "client-contract.v1", reference: `FICTIONAL-${label.toUpperCase()}-2026`, startsOn: "2026-01-01", endsOn: null, sorVersionIds: [demo.sorVersionId], tenderedAdjustment: demo.adjustment, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 };
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
