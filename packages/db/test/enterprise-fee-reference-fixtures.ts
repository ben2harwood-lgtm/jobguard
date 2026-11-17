import { randomUUID } from "node:crypto";
import { deriveEnterpriseReferenceStatement, type EnterpriseGroup, type EnterpriseExtra } from "@jobguard/core";
const exact = (n: number | string, d = "1") => ({ numerator: String(n), denominator: d });

// Independently construct the core contract from the scenario, not from SQL's fee result.
export function reference(t: { w: { w: { p: { tenantId: string } }; s: { jobId: string } }; id: string }, rows: { id?: string; approved: number; billed: number; paid: { numerator: string; denominator: string }; credit?: number; duplicateOf?: string; kind?: "site_user" | "office_entry" | "client_instruction" }[], rate = 10, agreementId = t.id) {
  const tenantId = t.w.w.p.tenantId, jobId = t.w.s.jobId, hash = "a".repeat(64), at = "2026-10-05T12:00:00Z";
  const groups: EnterpriseGroup[] = rows.map(row => {
    const id = row.id ?? randomUUID(), scope = randomUUID(), revisionId = randomUUID(), exported = randomUUID(), actor = randomUUID(), raiser = randomUUID(), command = randomUUID();
    const kind = row.kind ?? "site_user", role = kind === "site_user" ? "operative" : "surveyor";
    const grant = (membershipId: string, role: "operative" | "surveyor" | "supervisor") => ({ id: randomUUID(), tenantId, jobId, membershipId, role });
    const identity = { tenantId, jobId, scopeItemId: scope, revisionId, revisionHash: hash, exportLineId: exported, invoiceId: id, invoiceLineId: id, recordedAt: at, effectiveAt: at, status: "finalized" as const };
    const extra: EnterpriseExtra = { id, tenantId, jobId, scopeItemId: scope, state: row.duplicateOf ? "duplicate" : "paid", duplicateOf: row.duplicateOf ?? null, billingBalances: { billedNetPence: row.billed, settledNetPence: 0 }, workDone: false,
      exportedAt: at, revision: { id: revisionId, hash, serverRecordedAt: at, netPence: row.approved, priceConfirmed: true, priceSource: "surveyor_quoted",
        requirement: { ruleVersion: "fixture.v1", steps: [{ role: "supervisor", alternates: [] }], photoRequired: false, residentRequired: false },
        approvals: [{ index: 0, revisionId, hash, netPence: row.approved, ruleVersion: "fixture.v1", actorId: actor, grant: grant(actor, "supervisor"), role: "supervisor", timing: "before_work", serverRecordedAt: at }] },
      origin: { version: "extra-origin.v1", tenantId, jobId, variationId: id, origin: { version: "variation-origin.v1", jobTrack: "contractor", kind }, commandId: command, raisingMembershipId: raiser, raisingRole: role, serverRecordedAt: at, deviceId: null, deviceCapturedAt: null, evidenceHash: null },
      raisingCommand: { id: command, type: kind === "site_user" ? "LogSiteExtra" : kind === "office_entry" ? "RecordOfficeExtra" : "RecordClientInstruction", actorId: raiser, role, grant: grant(raiser, role), assigned: true },
      orderAtOrigin: { revisionId: randomUUID(), hash, coverage: "new" }, captureNote: "Fictional reference extra", photo: { status: "none", evidenceId: null, hash: null, tenantId: null, jobId: null, scopeItemId: null, objectVersionId: null }, residentCaptured: false, residentConfirmationHash: null, prompt: null, exportLineId: exported,
      billingFacts: [{ ...identity, sourceRef: `invoice-${id}`, kind: "invoiced", net: exact(row.billed), allocationRule: null, originalSourceRef: null },
        { ...identity, sourceRef: `paid-${id}`, kind: "settled", net: row.paid, allocationRule: "pro_rata", originalSourceRef: null },
        ...(row.credit ? [{ ...identity, sourceRef: `credit-${id}`, kind: "credited" as const, net: exact(row.credit), allocationRule: null, originalSourceRef: null }] : [])] };
    return { version: "enterprise-group.v1", tenantId, jobId, jobTrack: "contractor", currency: "GBP", mode: "synthetic_demo", feeGate: false, canonicalId: id, members: [extra], unresolvedCandidateIds: [], agreementVersionId: agreementId };
  });
  for (const row of rows.filter(r => r.duplicateOf)) {
    const duplicate = groups.find(g => g.canonicalId === row.id)!, canonical = groups.find(g => g.canonicalId === row.duplicateOf)!;
    canonical.members.push(...duplicate.members); groups.splice(groups.indexOf(duplicate), 1);
  }
  return deriveEnterpriseReferenceStatement({ version: "enterprise-statement.v1", tenantId, period: "2026-10", statementId: randomUUID(), inputFactsHash: hash,
    recordedCutoff: "2026-11-01T00:00:00Z", mode: "synthetic_demo", feeGate: false, groups,
    agreements: [{ version: "enterprise-agreement.v1", id: agreementId, tenantId, hash, effectiveFrom: "2000-01-01T00:00:00Z", rate: { version: "fee-rate.v1", policyVersion: agreementId, numerator: String(rate), denominator: "100" }, basis: "on_payment", minimumCommitment: null, onboardingFee: null, volumeBands: null }], prior: [] }).sections[0]!;
}
