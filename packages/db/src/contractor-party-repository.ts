import type { Pool } from "pg";
import { z } from "zod";
import { ContractorPartyError, contractorPartyErrorCodes, contractorCustomerLinkV1, contractorPartyImportBoundaryV1, contractorPartyResultV1, contractorResidentReadV1, contractorPartyAuditPayload } from "@jobguard/core";
import { ContractorRepository } from "./contractor-repository.js";
import { appendAuditBatch } from "./audit.js";
import { withTenant, verifiedTenantContextFromMembership, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";
const uuid = z.string().uuid();
/** Never propagate PostgreSQL DETAIL, query arguments or untrusted contacts into HTTP/log errors. */
function failure(error: unknown): never {
  if (error instanceof ContractorPartyError) throw error;
  const e = error as { code?: string; message?: string };
  const known = contractorPartyErrorCodes.find(code => e.message === code || e.code === code);
  if (known) throw new ContractorPartyError(known);
  if (e.code === "23505") throw new ContractorPartyError("COMMAND_CONFLICT");
  if (e.code === "40001") throw new ContractorPartyError("STALE_REVISION");
  if (e.code === "23503") throw new ContractorPartyError("PARTY_NOT_FOUND");
  if (["23514", "22P02", "22003", "22023", "23502"].includes(e.code ?? "")) throw new ContractorPartyError("INVALID_COMMAND");
  if (["42501", "P0002"].includes(e.code ?? "")) throw new ContractorPartyError("NOT_FOUND");
  throw new ContractorPartyError("DATABASE_UNAVAILABLE");
}
export class ContractorPartyRepository {
  constructor(private readonly pool: Pool) {}
  private async verify(db: TenantTransaction, principal: AuthenticatedMembership) {
    const result = await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND app.contractor_member_active(id)", [principal.tenantId, principal.membershipId, principal.identityUserId]);
    if (!result.rowCount) throw new ContractorPartyError("NOT_FOUND");
  }
  async resolveSession(sessionId: string) {
    try { return await new ContractorRepository(this.pool).resolveSession(sessionId); } catch (error) { failure(error); }
  }
  async linkCustomer(principal: AuthenticatedMembership, clientId: string, raw: unknown) {
    const parsed = contractorCustomerLinkV1.safeParse(raw);
    if (!uuid.safeParse(clientId).success) throw new ContractorPartyError("NOT_FOUND");
    if (!parsed.success) throw new ContractorPartyError("INVALID_COMMAND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [principal.tenantId]);
        await this.verify(db, principal);
        const row = (await db.$client.query<{ result: unknown }>("SELECT app.link_contractor_customer($1,$2,$3::jsonb) result", [principal.membershipId, clientId, JSON.stringify(parsed.data)])).rows[0]!;
        const result = contractorPartyResultV1.parse(row.result);
        await this.audit(db, principal, "customer_linked", clientId, result.commandId, result.id);
        return result;
      });
    } catch (error) { failure(error); }
  }
  /**
   * ENT-2 must call bindInTransaction inside its own import transaction, append all audit events last, and commit once.
   * An absent or null client, contract, site, or resident contact/reason is not a malformed command: after the membership
   * check the controlled routine refuses it with CONTRACTOR_PARTIES_REQUIRED, writing nothing. A refusal aborts the caller's
   * PostgreSQL transaction, so the caller must roll it back.
   */
  async bindInTransaction(db: TenantTransaction, principal: AuthenticatedMembership, raw: unknown) {
    const parsed = contractorPartyImportBoundaryV1.safeParse(raw);
    if (!parsed.success) throw new ContractorPartyError("INVALID_COMMAND");
    try {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [principal.tenantId]);
      await this.verify(db, principal);
      const row = (await db.$client.query<{ result: unknown }>("SELECT app.bind_contractor_parties($1,$2::jsonb) result", [principal.membershipId, JSON.stringify(parsed.data)])).rows[0]!;
      return contractorPartyResultV1.parse(row.result);
    } catch (error) { failure(error); }
  }
  async bind(principal: AuthenticatedMembership, raw: unknown) {
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        const result = await this.bindInTransaction(db, principal, raw);
        // Reached only after the routine accepted a complete import, so the job ID is present and valid.
        const input = contractorPartyImportBoundaryV1.parse(raw);
        await this.audit(db, principal, "bound", input.jobId, result.commandId, result.id);
        return result;
      });
    } catch (error) { failure(error); }
  }
  /** Finish every caller domain write before this call; audit head is the final business lock. */
  async audit(db: TenantTransaction, principal: AuthenticatedMembership, action: "customer_linked" | "bound", subject: string, commandId: string, id: string) {
    const receipt = (await db.$client.query<{ request_hash: string; audited: boolean }>("SELECT request_hash,EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2) audited FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [principal.tenantId, commandId])).rows[0]!;
    if (receipt.audited) return;
    await appendAuditBatch(db, [{ id: commandId, version: "audit.v1", actorRef: `membership:${principal.membershipId}`, eventType: `contractor.parties.${action}`, subjectType: action === "bound" ? "job" : "contractor-client", subjectRef: subject, payload: contractorPartyAuditPayload(action, commandId, id, receipt.request_hash) }]);
  }
  async readResident(principal: AuthenticatedMembership, jobId: string) {
    if (!uuid.safeParse(jobId).success) throw new ContractorPartyError("NOT_FOUND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))", [principal.tenantId]);
        await this.verify(db, principal);
        const row = (await db.$client.query<{ result: unknown }>("SELECT app.read_contractor_resident($1,$2) result", [principal.membershipId, jobId])).rows[0]!;
        return contractorResidentReadV1.parse(row.result);
      });
    } catch (error) { failure(error); }
  }
}

/** Reusable ENT-2 test assertion; importing this does not register CH-3b's test suite. */
export async function assertContractorPartiesRequired(call: () => Promise<unknown>): Promise<void> {
  try { await call(); } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "CONTRACTOR_PARTIES_REQUIRED" || e.message === "CONTRACTOR_PARTIES_REQUIRED") return;
    throw error;
  }
  throw new Error("Expected CONTRACTOR_PARTIES_REQUIRED refusal");
}
