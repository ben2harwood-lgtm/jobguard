import { enterpriseTransitionV1, originForCommand, readEnterprise, covers, refuse, assertExtraProvenance, enterpriseRoles, type EnterpriseExtra } from "./contracts.js";
import { approvalSnapshotValid, assertDuplicateGroup, captureSatisfied } from "./origin.js";

/** Pure projection/assertion over supplied server facts; no role grants, commands, effects or approvals are executed. */
export function transitionExtra(raw: unknown): EnterpriseExtra {
  const input = readEnterprise(enterpriseTransitionV1, raw), { command, actor } = input;
  const e = input.extra ?? input.creation;
  assertExtraProvenance(e);
  if (e.origin.origin.jobTrack !== "contractor") return refuse("INVALID_TRANSITION");
  if (input.expectedRevisionId !== e.revision.id || input.expectedHash !== e.revision.hash) return refuse("STALE_REVISION");
  const permit = (roles: readonly string[]) => { if (!covers(actor, e, roles)) refuse("PERMISSION_DENIED"); };
  const from = (states: readonly string[]) => { if (!input.extra || !states.includes(e.state)) refuse("INVALID_TRANSITION"); };
  const result = (state: EnterpriseExtra["state"], patch: Partial<EnterpriseExtra> = {}): EnterpriseExtra => ({ ...e, ...patch, state });
  if (["LogSiteExtra", "ConfirmPrompt", "RecordOfficeExtra", "RecordClientInstruction", "ImportOrderLine"].includes(command)) {
    if (input.extra !== null || input.creation.state !== "logged" || e.revision.approvals.length !== 0 || e.exportLineId !== null || e.exportedAt !== null || e.billingFacts.length !== 0 || e.duplicateOf !== null) return refuse("INVALID_TRANSITION");
    const roles = command === "LogSiteExtra" ? ["operative", "supervisor"] : command === "ConfirmPrompt" ? ["supervisor", "surveyor", "commercial_manager"] : command === "RecordOfficeExtra" ? ["supervisor", "surveyor", "commercial_manager", "admin"] : ["surveyor", "commercial_manager", "connector"];
    permit(roles);
    const expected = originForCommand(command, "contractor");
    if (e.origin.origin.jobTrack !== expected.jobTrack || e.origin.origin.kind !== expected.kind || e.raisingCommand.type !== command ||
      e.origin.raisingMembershipId !== actor.membershipId || e.raisingCommand.actorId !== actor.membershipId || e.origin.commandId !== e.raisingCommand.id || !actor.grants.some(g => g.id === e.raisingCommand.grant.id && g.membershipId === actor.membershipId && g.role === e.raisingCommand.role && g.tenantId === e.tenantId && g.jobId === e.jobId)) return refuse("INVALID_ORIGIN");
    if (command === "LogSiteExtra" && (!actor.assigned || !captureSatisfied(e))) return refuse("INVALID_TRANSITION");
    if (command === "ConfirmPrompt" && (!e.prompt || !covers(e.prompt.confirmedBy, e, roles) || e.prompt.confirmedBy.membershipId !== actor.membershipId)) return refuse("INVALID_ORIGIN");
    return result("logged");
  }
  switch (command) {
    case "SubmitExtra": case "PriceExtra": {
      from(["logged"]);
      const operative = covers(actor, e, ["operative"]) && actor.membershipId === e.origin.raisingMembershipId && e.revision.priceSource === "server_sor";
      if (!operative) permit(["supervisor", "surveyor"]);
      if (!approvalSnapshotValid(e, false)) return refuse("INVALID_TRANSITION");
      if (e.revision.requirement!.steps.length === 1 && e.revision.requirement!.steps[0]!.role === "contract_rule" && approvalSnapshotValid(e)) return result("approved");
      if (e.revision.approvals.length !== 0) return refuse("INVALID_TRANSITION");
      return result("awaiting_approval");
    }
    case "ApproveExtraStep": case "RejectExtra": {
      from(["awaiting_approval"]);
      if (!approvalSnapshotValid(e, false) || e.revision.approvals.length === e.revision.requirement!.steps.length) return refuse("INVALID_TRANSITION");
      const index = e.revision.approvals.length, required = e.revision.requirement!.steps[index]!;
      if (required.role === "contract_rule") return refuse("PERMISSION_DENIED"); // A recorded rule fact, not a human role/bypass.
      const roles: readonly string[] = [required.role, ...required.alternates]; permit(roles);
      if (actor.membershipId === e.origin.raisingMembershipId) return refuse("SELF_APPROVAL");
      if (e.revision.approvals.some(step => step.actorId === actor.membershipId)) return refuse("REUSED_APPROVER");
      if (command === "RejectExtra") { if (!input.reason.trim()) return refuse("INVALID_TRANSITION"); return result("rejected"); }
      const grant = actor.grants.find(g => g.membershipId === actor.membershipId && g.tenantId === e.tenantId && g.jobId === e.jobId && roles.includes(g.role))!;
      const revision = { ...e.revision, approvals: [...e.revision.approvals, {
        index, revisionId: e.revision.id, hash: e.revision.hash, netPence: e.revision.netPence!, ruleVersion: e.revision.requirement!.ruleVersion,
        actorId: actor.membershipId, grant, role: grant.role as "supervisor", timing: e.workDone ? "after_work" as const : "before_work" as const, serverRecordedAt: input.serverRecordedAt,
      }] };
      return result(revision.approvals.length === revision.requirement!.steps.length ? "approved" : "awaiting_approval", { revision });
    }
    case "WithdrawExtra": {
      from(["logged", "awaiting_approval", "approved"]);
      if (!covers(actor, e, ["supervisor", "surveyor", "commercial_manager"])) {
        if (!covers(actor, e, enterpriseRoles) || actor.membershipId !== e.origin.raisingMembershipId || e.revision.approvals.length !== 0) return refuse("PERMISSION_DENIED");
      }
      if (e.exportLineId !== null || !["not_done", "raised_in_error", "resident_cancelled", "already_on_order"].includes(input.reason)) return refuse("INVALID_TRANSITION");
      return result("withdrawn");
    }
    case "MarkDuplicate": {
      from(["logged", "awaiting_approval", "approved", "rejected"]); permit(["supervisor", "surveyor", "commercial_manager"]);
      const canonical = input.canonical; assertExtraProvenance(canonical);
      if (e.exportLineId !== null || canonical.exportLineId !== null || canonical.id === e.id || canonical.tenantId !== e.tenantId || canonical.jobId !== e.jobId || canonical.duplicateOf !== null || canonical.state === "duplicate") return refuse("INVALID_DUPLICATE_GROUP");
      return result("duplicate", { duplicateOf: canonical.id });
    }
    case "ReviseExtra": {
      from(["approved", "rejected"]); permit(["supervisor", "surveyor"]);
      const revision = input.newRevision;
      if (e.exportLineId !== null || revision.id === e.revision.id || revision.hash === e.revision.hash || revision.approvals.length !== 0 || !approvalSnapshotValid({ ...e, revision }, false)) return refuse("INVALID_TRANSITION");
      return result("awaiting_approval", { revision });
    }
    case "FinaliseExportBatch": {
      from(["approved"]); permit(["finance", "commercial_manager"]); assertDuplicateGroup(input.group);
      const canonical = input.group.members.find(member => member.id === input.group.canonicalId)!;
      if (input.group.canonicalId !== e.id || input.group.tenantId !== e.tenantId || input.group.jobId !== e.jobId || canonical.revision.id !== e.revision.id || canonical.revision.hash !== e.revision.hash ||
        input.group.unresolvedCandidateIds.length !== 0 || e.duplicateOf !== null || !approvalSnapshotValid(e)) return refuse("INVALID_TRANSITION");
      return result("exported", { exportLineId: input.exportLineId, exportedAt: input.serverRecordedAt });
    }
    case "ImportBillingStatus": {
      from(["exported", "billed", "part_paid", "paid"]); permit(["finance", "connector"]);
      if (!input.billing.matched || e.exportLineId === null || e.duplicateOf !== null) return refuse("INVALID_ALLOCATION");
      const fact = input.billing;
      const projected = (state: EnterpriseExtra["state"]) => result(state, { billingBalances: { billedNetPence: fact.remainingBilledNetPence, settledNetPence: fact.remainingSettledNetPence } });
      if (fact.kind === "rejected") { from(["exported"]); return projected("billing_rejected"); }
      if (fact.kind === "invoiced") { from(["exported", "billed"]); if (fact.remainingBilledNetPence === 0) return refuse("INVALID_TRANSITION"); return projected("billed"); }
      if (fact.kind === "credited") { from(["billed", "part_paid", "paid"]); return projected(fact.remainingBilledNetPence === 0 ? "credited" : e.state); }
      if (fact.kind === "payment_reversed") {
        from(["part_paid", "paid"]); if (fact.remainingSettledNetPence >= fact.remainingBilledNetPence) return refuse("INVALID_TRANSITION");
        return projected(fact.remainingSettledNetPence === 0 ? "billed" : "part_paid");
      }
      from(["billed", "part_paid", "paid"]);
      if (fact.remainingSettledNetPence <= 0 || fact.remainingSettledNetPence > fact.remainingBilledNetPence) return refuse("INVALID_TRANSITION");
      return projected(fact.remainingSettledNetPence === fact.remainingBilledNetPence ? "paid" : "part_paid");
    }
    default: return refuse("INVALID_TRANSITION");
  }
}
