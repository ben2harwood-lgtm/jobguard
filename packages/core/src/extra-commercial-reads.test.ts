import { describe, expect, it } from "vitest";
import {
  askedAgainstApprovedSummary, classifyExtraWork, extraCommercialReadAllowed, extraCommercialReadsV1, extraWorkListQueryV1, extraWorkStatesV1,
  ExtraCommercialReadError, clientEntitlementInputV1, type ExtraWorkInput,
} from "./extra-commercial-reads.js";

const member = "11111111-1111-4111-8111-111111111111", pricer = "22222222-2222-4222-8222-222222222222";
const p = (n: number | bigint, d: number | bigint = 1) => ({ numerator: String(n), denominator: String(d) });
const base = (over: Partial<ExtraWorkInput> = {}): ExtraWorkInput => ({
  version: "extra-work-input.v1", lifecycle: "awaiting_approval", evidence: { photoRequired: true, photoPresent: true, residentConfirmationRequired: false, residentConfirmationPresent: false },
  priced: true, request: { nextStep: { kind: "company", eligibleRoles: ["supervisor"] } },
  entitlement: { flags: null, validDecision: null }, duplicate: { unresolved: false, excludedMembershipIds: [] }, billing: null, ...over,
});
const logged = (over: Partial<ExtraWorkInput> = {}) => base({ lifecycle: "logged", request: null, ...over });
const exported = (billing: ExtraWorkInput["billing"]) => base({ lifecycle: "exported", billing });
const state = (input: ExtraWorkInput) => { const r = classifyExtraWork(input); return r.open ? r.state : `closed:${r.closedReason}`; };
const missingPhoto = { photoRequired: true, photoPresent: false, residentConfirmationRequired: false, residentConfirmationPresent: false };
const missingConfirmation = { photoRequired: false, photoPresent: false, residentConfirmationRequired: true, residentConfirmationPresent: false };

describe("work list: one state per open extra", () => {
  const cases: [string, ExtraWorkInput, string, string[], string][] = [
    ["missing photo", logged({ evidence: missingPhoto, priced: false }), "waiting_for_evidence", ["operative", "supervisor"], "add_evidence"],
    ["missing resident confirmation", base({ evidence: missingConfirmation }), "waiting_for_evidence", ["operative", "supervisor"], "add_evidence"],
    ["logged unpriced", logged({ priced: false }), "waiting_for_pricing", ["surveyor"], "price"],
    ["submitted unpriced", base({ priced: false }), "waiting_for_pricing", ["surveyor"], "price"],
    ["flagged pending, no decision", base({ entitlement: { flags: ["manual_price"], validDecision: null } }), "waiting_for_entitlement_decision", ["surveyor"], "decide_entitlement"],
    ["flagged priced not submitted, no decision", logged({ entitlement: { flags: ["no_rate_code"], validDecision: null } }), "waiting_for_entitlement_decision", ["surveyor"], "decide_entitlement"],
    ["held rule step, flags unknown", base({ request: { nextStep: { kind: "contract_rule" } } }), "waiting_for_entitlement_decision", ["surveyor"], "decide_entitlement"],
    ["unclear decision", base({ entitlement: { flags: ["ancillary_rule"], validDecision: "unclear" } }), "held_unclear", ["surveyor"], "obtain_instruction"],
    ["included in order, pending", base({ entitlement: { flags: ["excess_over_order"], validDecision: "included_in_order" } }), "included_withdraw", ["supervisor", "surveyor", "commercial_manager"], "withdraw"],
    ["included in rate, logged", logged({ entitlement: { flags: ["ancillary_rule"], validDecision: "included_in_rate" } }), "included_withdraw", ["supervisor", "surveyor", "commercial_manager"], "withdraw"],
    ["priced not submitted", logged(), "priced_not_submitted", ["supervisor", "surveyor"], "submit"],
    ["additional decision, logged", logged({ entitlement: { flags: ["manual_price"], validDecision: "additional" } }), "priced_not_submitted", ["supervisor", "surveyor"], "submit"],
    ["duplicate pending", base({ duplicate: { unresolved: true, excludedMembershipIds: [member, pricer] } }), "duplicate_resolution_required", ["supervisor", "surveyor", "commercial_manager"], "resolve_duplicate"],
    ["duplicate approved before export", base({ lifecycle: "approved", duplicate: { unresolved: true, excludedMembershipIds: [member] } }), "duplicate_resolution_required", ["supervisor", "surveyor", "commercial_manager"], "resolve_duplicate"],
    ["contractor step", base({ request: { nextStep: { kind: "company", eligibleRoles: ["supervisor", "commercial_manager", "supervisor"] } } }), "waiting_for_contractor_approval", ["commercial_manager", "supervisor"], "approve_or_reject"],
    ["additional decision, pending company step", base({ entitlement: { flags: ["manual_price"], validDecision: "additional" } }), "waiting_for_contractor_approval", ["supervisor"], "approve_or_reject"],
    ["client step", base({ request: { nextStep: { kind: "client" } } }), "waiting_for_client_approval", ["client_approver"], "client_approve_or_reject"],
    ["rejected", base({ lifecycle: "rejected" }), "rejected", ["surveyor"], "revise"],
    ["approved", base({ lifecycle: "approved" }), "approved_not_exported", ["finance"], "export"],
    ["exported", exported({ billedNet: p(0), creditedNet: p(0), paidNet: p(0), rejected: false }), "exported_not_billed", ["finance"], "chase_billing"],
    ["billed", exported({ billedNet: p(24000), creditedNet: p(0), paidNet: p(0), rejected: false }), "billed_not_paid", ["finance"], "chase_payment"],
    ["part paid", exported({ billedNet: p(24000), creditedNet: p(0), paidNet: p(41667 * 24000, 124000), rejected: false }), "part_paid", ["finance"], "chase_balance"],
    ["part paid after credit and reversal", exported({ billedNet: p(24000), creditedNet: p(4000), paidNet: p(1000), rejected: false }), "part_paid", ["finance"], "chase_balance"],
  ];
  for (const [name, input, expected, roles, action] of cases) it(`${name} -> ${expected}`, () => {
    const r = classifyExtraWork(input);
    expect(r).toMatchObject({ open: true, state: expected, ownerRoles: roles, nextAction: action, precedence: extraWorkStatesV1.indexOf(expected as never) });
  });
  it("covers every state in the precedence table", () => {
    expect(new Set(cases.map(c => c[2]))).toEqual(new Set(extraWorkStatesV1));
  });
  it("closes withdrawn, duplicate, paid, credited-in-full and billing-rejected extras", () => {
    expect(state(base({ lifecycle: "withdrawn" }))).toBe("closed:withdrawn");
    expect(state(base({ lifecycle: "duplicate", duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("closed:duplicate");
    expect(state(exported({ billedNet: p(24000), creditedNet: p(0), paidNet: p(24000), rejected: false }))).toBe("closed:paid");
    expect(state(exported({ billedNet: p(24000), creditedNet: p(4000), paidNet: p(20000), rejected: false }))).toBe("closed:paid");
    expect(state(exported({ billedNet: p(24000), creditedNet: p(24000), paidNet: p(0), rejected: false }))).toBe("closed:credited_in_full");
    expect(state(exported({ billedNet: p(24000), creditedNet: p(0), paidNet: p(0), rejected: true }))).toBe("closed:billing_rejected");
  });
  it("gives the exact outstanding balance on billed and part-paid extras", () => {
    expect(classifyExtraWork(exported({ billedNet: p(24000), creditedNet: p(4000), paidNet: p(0), rejected: false }))).toMatchObject({ balance: p(20000) });
    expect(classifyExtraWork(exported({ billedNet: p(24000), creditedNet: p(4000), paidNet: p(1, 3), rejected: false }))).toMatchObject({ balance: p(59999, 3) });
    expect(classifyExtraWork(base())).toMatchObject({ balance: null });
  });
  it("names who may not resolve a duplicate (reporter and pricer)", () => {
    expect(classifyExtraWork(base({ duplicate: { unresolved: true, excludedMembershipIds: [member, pricer] } }))).toMatchObject({ excludedMembershipIds: [member, pricer] });
    expect(classifyExtraWork(base({ request: { nextStep: { kind: "client" } } }))).toMatchObject({ excludedMembershipIds: [] });
  });
});

describe("work list precedence", () => {
  it("evidence beats pricing, entitlement, duplicate and approval", () => {
    expect(state(base({ evidence: missingPhoto, priced: false, duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("waiting_for_evidence");
    expect(state(base({ evidence: missingPhoto, entitlement: { flags: ["manual_price"], validDecision: null } }))).toBe("waiting_for_evidence");
  });
  it("pricing beats entitlement and duplicate", () => {
    expect(state(logged({ priced: false, entitlement: { flags: ["no_rate_code"], validDecision: null }, duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("waiting_for_pricing");
  });
  it("entitlement beats submission, duplicate and approval; a decision moves it on", () => {
    const flagged = { flags: ["manual_price" as const], validDecision: null };
    expect(state(logged({ entitlement: flagged, duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("waiting_for_entitlement_decision");
    expect(state(base({ entitlement: flagged, request: { nextStep: { kind: "client" } } }))).toBe("waiting_for_entitlement_decision");
    expect(state(base({ entitlement: { ...flagged, validDecision: "additional" }, duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("duplicate_resolution_required");
  });
  it("submission beats duplicate resolution; duplicate beats contractor and client approval", () => {
    expect(state(logged({ duplicate: { unresolved: true, excludedMembershipIds: [] } }))).toBe("priced_not_submitted");
    expect(state(base({ duplicate: { unresolved: true, excludedMembershipIds: [] }, request: { nextStep: { kind: "client" } } }))).toBe("duplicate_resolution_required");
  });
  it("an empty flag list is unflagged; unknown flags never invent a hold", () => {
    expect(state(base({ entitlement: { flags: [], validDecision: null } }))).toBe("waiting_for_contractor_approval");
    expect(state(base({ entitlement: { flags: null, validDecision: null } }))).toBe("waiting_for_contractor_approval");
    expect(state(logged({ entitlement: { flags: null, validDecision: "unclear" } }))).toBe("priced_not_submitted");
  });
  it("a rejected item reads as Revise and an approved binding never reads as an entitlement action", () => {
    for (const validDecision of [null, "unclear", "included_in_order", "included_in_rate", "additional"] as const) {
      const entitlement = { flags: ["manual_price" as const, "ancillary_rule" as const], validDecision };
      expect(state(base({ lifecycle: "rejected", entitlement }))).toBe("rejected");
      expect(state(base({ lifecycle: "approved", entitlement }))).toBe("approved_not_exported");
      expect(state(exported({ billedNet: p(0), creditedNet: p(0), paidNet: p(0), rejected: false }))).toBe("exported_not_billed");
    }
  });
  it("evidence never holds an item after approval or rejection", () => {
    expect(state(base({ lifecycle: "rejected", evidence: missingPhoto }))).toBe("rejected");
    expect(state(base({ lifecycle: "approved", evidence: missingPhoto }))).toBe("approved_not_exported");
  });
  it("an included decision reads as withdraw only where withdrawal is permitted", () => {
    expect(state(logged({ entitlement: { flags: ["ancillary_rule"], validDecision: "included_in_order" } }))).toBe("included_withdraw");
    expect(state(base({ entitlement: { flags: ["ancillary_rule"], validDecision: "included_in_rate" } }))).toBe("included_withdraw");
    expect(state(base({ lifecycle: "rejected", entitlement: { flags: ["ancillary_rule"], validDecision: "included_in_rate" } }))).toBe("rejected");
  });
  it("unknown evidence rules are not missing evidence", () => {
    expect(state(logged({ evidence: null }))).toBe("priced_not_submitted");
  });
});

describe("work list transitions", () => {
  it("walks the family-3 path: pending, rejected, revised pending, approved, exported, billed, part paid, paid", () => {
    const path = [
      base(), base({ lifecycle: "rejected" }), base(), base({ lifecycle: "approved" }),
      exported({ billedNet: p(0), creditedNet: p(0), paidNet: p(0), rejected: false }),
      exported({ billedNet: p(30000), creditedNet: p(0), paidNet: p(0), rejected: false }),
      exported({ billedNet: p(30000), creditedNet: p(0), paidNet: p(10000), rejected: false }),
      exported({ billedNet: p(30000), creditedNet: p(0), paidNet: p(30000), rejected: false }),
      // A later reversal reopens the balance.
      exported({ billedNet: p(30000), creditedNet: p(0), paidNet: p(20000), rejected: false }),
    ];
    expect(path.map(state)).toEqual(["waiting_for_contractor_approval", "rejected", "waiting_for_contractor_approval", "approved_not_exported", "exported_not_billed",
      "billed_not_paid", "part_paid", "closed:paid", "part_paid"]);
  });
  it("walks an entitlement hold: flagged, unclear, decided, then a new price revision needs a fresh decision", () => {
    const flags = ["manual_price" as const];
    expect([null, "unclear", "additional", null].map(d => state(base({ entitlement: { flags, validDecision: d as never } }))))
      .toEqual(["waiting_for_entitlement_decision", "held_unclear", "waiting_for_contractor_approval", "waiting_for_entitlement_decision"]);
  });
  it("walks late pricing and submission", () => {
    expect([logged({ priced: false }), logged(), base(), base({ request: { nextStep: { kind: "client" } } })].map(state))
      .toEqual(["waiting_for_pricing", "priced_not_submitted", "waiting_for_contractor_approval", "waiting_for_client_approval"]);
  });
  it("gives exactly one open state or one closed reason for every combination", () => {
    const lifecycles = ["logged", "awaiting_approval", "approved", "rejected", "withdrawn", "duplicate", "exported"] as const;
    const evidences = [null, missingPhoto, { ...missingPhoto, photoPresent: true }];
    const steps = [null, { kind: "company" as const, eligibleRoles: ["supervisor"] }, { kind: "client" as const }, { kind: "contract_rule" as const }];
    const flagSets = [null, [], ["manual_price" as const]];
    const decisions = [null, "additional", "unclear", "included_in_order", "included_in_rate"] as const;
    const billings = [{ billedNet: p(0), creditedNet: p(0), paidNet: p(0), rejected: false }, { billedNet: p(10), creditedNet: p(0), paidNet: p(5), rejected: false }];
    let checked = 0;
    for (const lifecycle of lifecycles) for (const evidence of evidences) for (const priced of [true, false]) for (const nextStep of steps)
      for (const flags of flagSets) for (const validDecision of decisions) for (const unresolved of [true, false]) for (const billing of billings) {
        const input = base({ lifecycle, evidence, priced, request: lifecycle === "logged" ? null : { nextStep }, entitlement: { flags, validDecision },
          duplicate: { unresolved, excludedMembershipIds: [] }, billing: lifecycle === "exported" ? billing : null });
        try {
          const r = classifyExtraWork(input);
          if (r.open) expect(extraWorkStatesV1).toContain(r.state); else expect(r.closedReason).toBeTruthy();
          if (r.open && ["approved", "rejected", "exported"].includes(lifecycle)) expect(["waiting_for_entitlement_decision", "held_unclear", "included_withdraw"]).not.toContain(r.state);
          checked++;
        } catch (error) { expect(error).toMatchObject({ code: "INCONSISTENT_WORK_INPUT" }); }
      }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("work list refusals", () => {
  const code = (input: unknown) => { try { classifyExtraWork(input); return "ok"; } catch (e) { return (e as ExtraCommercialReadError).code; } };
  it("refuses impossible snapshots instead of guessing", () => {
    expect(code(logged({ request: { nextStep: null } }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ request: null }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ request: { nextStep: null } }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ lifecycle: "approved", billing: { billedNet: p(0), creditedNet: p(0), paidNet: p(0), rejected: false } }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ lifecycle: "exported", billing: null }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ priced: false, request: { nextStep: { kind: "contract_rule" } } }))).toBe("INCONSISTENT_WORK_INPUT");
    expect(code(base({ request: { nextStep: { kind: "contract_rule" } }, entitlement: { flags: null, validDecision: "additional" } }))).toBe("INCONSISTENT_WORK_INPUT");
  });
  it("refuses malformed or widened input", () => {
    expect(code({ ...base(), tenantId: member })).toBe("INVALID_QUERY");
    expect(code({ ...base(), version: "extra-work-input.v2" })).toBe("INVALID_QUERY");
    expect(code(base({ entitlement: { flags: ["duplicate" as never], validDecision: null } }))).toBe("INVALID_QUERY");
    expect(code(base({ request: { nextStep: { kind: "company", eligibleRoles: [] } } }))).toBe("INVALID_QUERY");
  });
});

describe("asked against approved", () => {
  const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
  it("family 3: £500 rejected as price_too_high then £300 approved keeps both figures", () => {
    const s = askedAgainstApprovedSummary([
      { requestId: id(2), requestRevision: 2, netPence: 30000, outcome: { kind: "approved", reasonCode: null } },
      { requestId: id(1), requestRevision: 1, netPence: 50000, outcome: { kind: "rejected", reasonCode: "price_too_high" } },
    ]);
    expect(s).toEqual({ firstRequestedNetPence: 50000, firstRequestedRequestId: id(1), pendingNetPence: null, pendingRequestId: null, latestUnpricedPending: false,
      approvedNetPence: 30000, approvedRequestId: id(2), differencePence: -20000 });
  });
  it("keeps a pending revision apart from the earlier approved amount", () => {
    const s = askedAgainstApprovedSummary([
      { requestId: id(1), requestRevision: 1, netPence: 40000, outcome: { kind: "approved", reasonCode: null } },
      { requestId: id(2), requestRevision: 2, netPence: 45000, outcome: null },
    ]);
    expect(s).toMatchObject({ approvedNetPence: 40000, pendingNetPence: 45000, differencePence: 0 });
  });
  it("unpriced and old records stay unknown, never zero", () => {
    expect(askedAgainstApprovedSummary([{ requestId: id(1), requestRevision: 1, netPence: null, outcome: null }]))
      .toMatchObject({ firstRequestedNetPence: null, pendingNetPence: null, latestUnpricedPending: true, approvedNetPence: null, differencePence: null });
    expect(askedAgainstApprovedSummary([])).toMatchObject({ firstRequestedNetPence: null, approvedNetPence: null, differencePence: null, latestUnpricedPending: false });
  });
  it("late pricing: an unpriced first request is not the first requested figure", () => {
    expect(askedAgainstApprovedSummary([
      { requestId: id(1), requestRevision: 1, netPence: null, outcome: null },
      { requestId: id(2), requestRevision: 2, netPence: 12000, outcome: { kind: "approved", reasonCode: null } },
    ])).toMatchObject({ firstRequestedNetPence: 12000, approvedNetPence: 12000, differencePence: 0 });
  });
  it("refuses duplicate revisions and malformed amounts", () => {
    expect(() => askedAgainstApprovedSummary([{ requestId: id(1), requestRevision: 1, netPence: 1, outcome: null }, { requestId: id(2), requestRevision: 1, netPence: 2, outcome: null }])).toThrow("INCONSISTENT_WORK_INPUT");
    for (const netPence of [0, -1, 1.5, 1_000_000_000_001]) expect(() => askedAgainstApprovedSummary([{ requestId: id(1), requestRevision: 1, netPence, outcome: null }])).toThrow("INVALID_QUERY");
  });
});

describe("read roles and queries", () => {
  it("keeps every read to contractor reader roles and never the client or operative", () => {
    for (const read of extraCommercialReadsV1) for (const role of ["client_approver", "operative", "owner", "admin", "read_only", "anything"]) expect(extraCommercialReadAllowed(role, read)).toBe(false);
    expect(extraCommercialReadAllowed("finance", "entitlement_context")).toBe(false);
    for (const read of ["asked_against_approved", "work_list", "claim_record"] as const) expect(extraCommercialReadAllowed("finance", read)).toBe(true);
    for (const role of ["supervisor", "surveyor", "commercial_manager"]) for (const read of extraCommercialReadsV1) expect(extraCommercialReadAllowed(role, read)).toBe(true);
  });
  it("accepts only the stated filters", () => {
    expect(extraWorkListQueryV1.safeParse({ version: "extra-work-list-query.v1", states: ["rejected"], orderReference: "WO-1", rateCode: "R1", clientContractId: member, teamId: pricer,
      raisedFrom: "2026-11-01T00:00:00Z", raisedTo: "2026-11-30T00:00:00Z" }).success).toBe(true);
    for (const extra of [{ tenantId: member }, { residentEmail: "x@y.invalid" }, { membershipId: member }, { states: ["paid"] }, { raisedFrom: "2026-12-01T00:00:00Z", raisedTo: "2026-11-01T00:00:00Z" }])
      expect(extraWorkListQueryV1.safeParse({ version: "extra-work-list-query.v1", ...extra }).success, JSON.stringify(extra)).toBe(false);
  });
  it("the client projection input carries no amount, actor or tenant", () => {
    const ok = { version: "extra-customer.v1", action: "entitlement", jobId: member, requestId: pricer };
    expect(clientEntitlementInputV1.safeParse(ok).success).toBe(true);
    for (const key of ["netPence", "actorMembershipId", "tenantId", "clientId", "extraId"]) expect(clientEntitlementInputV1.safeParse({ ...ok, [key]: member }).success).toBe(false);
  });
});
