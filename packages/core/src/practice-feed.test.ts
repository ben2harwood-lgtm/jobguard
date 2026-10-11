import { describe, expect, it } from "vitest";
import {
  assessAttestedReceipt,
  generatedPracticeFeedEvents,
  practiceFeedAdapterEventV1,
  practiceFeedCommandV1,
  practiceFeedQueryV1,
  practiceFeedStepV1,
  practiceMovementCatalogueV1,
  practiceMovementDefinition,
  practiceMovementKeyV1,
  projectPracticeFeedMovements,
  type PracticeFeedMovement,
  type PracticeMovementKey,
} from "./practice-feed.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const payment = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = { version: "practice-feed-command.v1", commandId: id, expectedRevision: 0 };
const hashed = (events: ReturnType<typeof generatedPracticeFeedEvents>) => events.map((event) => ({ ...event, sourceHash: "a".repeat(64) }));
const run = (movement: PracticeMovementKey, steps: Array<Parameters<typeof generatedPracticeFeedEvents>[1]>) =>
  hashed(steps.flatMap((step) => generatedPracticeFeedEvents(movement, step)));
const only = (movements: readonly PracticeFeedMovement[]) => {
  expect(movements).toHaveLength(1);
  return movements[0]!;
};

describe("M4-7-S fixed synthetic movement catalogue", () => {
  it("holds exactly the plan's movements, in exact pence", () => {
    expect(practiceMovementCatalogueV1.map(({ movement, grossPence, kind, fixture }) => [movement, grossPence, kind, fixture])).toEqual([
      ["receipt-384", 38_400, "customer_receipt", "recovery-18800"],
      ["receipt-3000", 300_000, "customer_receipt", "recovery-18800"],
      ["receipt-41280", 4_128_000, "customer_receipt", "shadow-30000"],
      ["receipt-24000", 2_400_000, "customer_receipt", "test-m"],
      ["receipt-17280", 1_728_000, "customer_receipt", "test-m"],
      ["receipt-960", 96_000, "customer_receipt", "test-n"],
      ["supplier-refund-540", 54_000, "supplier_refund", "supplier-refund"],
    ]);
    expect(practiceMovementKeyV1.options).toEqual(practiceMovementCatalogueV1.map((entry) => entry.movement));
  });
  it("is internally consistent with the plan arithmetic", () => {
    const pence = (key: PracticeMovementKey) => practiceMovementDefinition(key).grossPence;
    expect(pence("receipt-24000") + pence("receipt-17280")).toBe(pence("receipt-41280"));
    expect(pence("receipt-384") + pence("receipt-3000")).toBe(338_400);
    expect(new Set(practiceMovementCatalogueV1.map((entry) => entry.grossPence)).size).toBe(practiceMovementCatalogueV1.length);
    for (const entry of practiceMovementCatalogueV1) expect(Number.isSafeInteger(entry.grossPence) && entry.grossPence > 0).toBe(true);
  });
});

describe("M4-7-S versioned commands and queries", () => {
  it("accepts each bounded command exactly", () => {
    expect(practiceFeedCommandV1.parse({ ...base, action: "connect" }).action).toBe("connect");
    expect(practiceFeedCommandV1.parse({ ...base, action: "advance", movement: "receipt-384", step: "pending" })).toMatchObject({ movement: "receipt-384", step: "pending" });
    expect(practiceFeedCommandV1.parse({ ...base, action: "reconcile_duplicate", movement: "receipt-3000" }).action).toBe("reconcile_duplicate");
    expect(practiceFeedCommandV1.parse({ ...base, action: "match_receipt", movement: "receipt-960", paymentId: payment }).action).toBe("match_receipt");
    expect(practiceFeedCommandV1.parse({ ...base, action: "disconnect" }).action).toBe("disconnect");
  });
  it.each(["amountPence", "grossPence", "settled", "state", "tenantId", "accountId", "eventId", "environment", "signature", "currency", "movementId"])(
    "refuses browser authority field %s on every action", (field) => {
      for (const body of [
        { action: "connect" }, { action: "disconnect" },
        { action: "advance", movement: "receipt-384", step: "settled" },
        { action: "reconcile_duplicate", movement: "receipt-384" },
        { action: "match_receipt", movement: "receipt-384", paymentId: payment },
      ]) expect(practiceFeedCommandV1.safeParse({ ...base, ...body, [field]: "forged" }).success).toBe(false);
    });
  it("refuses unknown movements, steps, missing members and malformed ids", () => {
    for (const body of [
      { action: "advance", movement: "receipt-999", step: "settled" },
      { action: "advance", movement: "receipt-384", step: "refunded" },
      { action: "advance", movement: "receipt-384" },
      { action: "advance", step: "settled" },
      { action: "reconcile_duplicate" },
      { action: "match_receipt", movement: "receipt-384" },
      { action: "match_receipt", movement: "receipt-384", paymentId: "not-a-uuid" },
      { action: "match_receipt", movement: "supplier-refund-540", paymentId: payment },
      { action: "disconnect", movement: "receipt-384" },
      { action: "wire_money" },
    ]) expect(practiceFeedCommandV1.safeParse({ ...base, ...body }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...base, commandId: "x", action: "connect" }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...base, expectedRevision: -1, action: "connect" }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...base, version: "practice-feed-command.v2", action: "connect" }).success).toBe(false);
  });
  it("bounds the pagination query", () => {
    expect(practiceFeedQueryV1.parse({ version: "practice-feed-query.v1", limit: "1", cursor: "0" })).toMatchObject({ limit: 1, cursor: "0" });
    expect(practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" })).toMatchObject({ limit: 20 });
    for (const query of [{ limit: 0 }, { limit: 51 }, { cursor: "-1" }, { cursor: "1.5" }, { cursor: "01" }, { tenantId: "forged" }]) {
      expect(practiceFeedQueryV1.safeParse({ version: "practice-feed-query.v1", ...query }).success).toBe(false);
    }
  });
});

describe("M4-7-S deterministic generated adapter events", () => {
  it("generates the fixed events for every step of every movement", () => {
    for (const { movement: key, grossPence } of practiceMovementCatalogueV1) {
      expect(generatedPracticeFeedEvents(key, "pending").map((e) => [e.eventId, e.state, e.identity])).toEqual([[`pending-${key}`, "pending", "identified"]]);
      expect(generatedPracticeFeedEvents(key, "settled").map((e) => [e.eventId, e.state])).toEqual([[`settled-${key}`, "settled"]]);
      expect(generatedPracticeFeedEvents(key, "replay").map((e) => e.eventId)).toEqual([`settled-${key}`]);
      expect(generatedPracticeFeedEvents(key, "page_overlap").map((e) => e.eventId)).toEqual([`pending-${key}`, `settled-${key}`]);
      expect(generatedPracticeFeedEvents(key, "alternate_representation").map((e) => [e.eventId, e.representationId, e.state])).toEqual([[`statement-${key}`, "statement-line", "settled"]]);
      expect(generatedPracticeFeedEvents(key, "unknown_duplicate").map((e) => [e.eventId, e.identity, e.state])).toEqual([[`unknown-${key}`, "unidentified", "possible_duplicate"]]);
      for (const step of practiceFeedStepV1.options) {
        for (const event of generatedPracticeFeedEvents(key, step)) {
          expect(practiceFeedAdapterEventV1.parse(event)).toEqual(event);
          expect(event).toMatchObject({ grossPence, currency: "GBP", environment: "synthetic_demo", movementKey: key });
        }
      }
    }
  });
  it("refuses a forged event: wrong amount, environment, identity, state or currency", () => {
    const event = generatedPracticeFeedEvents("receipt-384", "settled")[0]!;
    for (const forged of [
      { grossPence: 38_500 }, { grossPence: 1.5 }, { grossPence: 4_128_000 }, { currency: "EUR" },
      { environment: "production" }, { environment: "production_billing" }, { environment: "pilot_no_charge" }, { environment: "provider_sandbox" },
      { eventId: "settled-receipt-3000" }, { eventId: "forged" }, { eventKind: "pending" }, { state: "pending" }, { state: "possible_duplicate" },
      { identity: "unidentified" }, { representationId: "statement-line" }, { movementKey: "receipt-999" }, { version: "practice-feed-event.v2" },
      { extra: "field" },
    ]) expect(practiceFeedAdapterEventV1.safeParse({ ...event, ...forged }).success, JSON.stringify(forged)).toBe(false);
  });
});

describe("M4-7-S monotone movement projection", () => {
  it("shows pending as pending, then settled as the same movement; settlement is never allocation", () => {
    const pending = only(projectPracticeFeedMovements("acct", run("receipt-384", ["pending"]), []));
    expect(pending).toMatchObject({ grossPence: 38_400, state: "pending", allocatedEligibleNetPence: 0, eligibleForAllocation: false });
    const settled = only(projectPracticeFeedMovements("acct", run("receipt-384", ["pending", "settled"]), []));
    expect(settled).toMatchObject({ state: "settled", allocatedEligibleNetPence: 0, eligibleForAllocation: true, eventIds: ["pending-receipt-384", "settled-receipt-384"] });
    expect(settled.id).toBe(pending.id);
    expect(settled.id).toBe("acct:receipt-384");
  });
  it("a late or replayed pending event cannot undo a settled fact, even as the final event", () => {
    const events = run("receipt-384", ["settled", "pending"]);
    expect(events.at(-1)!.state).toBe("pending");
    expect(only(projectPracticeFeedMovements("acct", events, [])).state).toBe("settled");
    expect(only(projectPracticeFeedMovements("acct", [...events].reverse(), [])).state).toBe("settled");
  });
  it("replays, overlapping pages and known alternate representations give one movement", () => {
    const events = run("receipt-3000", ["settled", "replay", "page_overlap", "alternate_representation", "pending"]);
    const movement = only(projectPracticeFeedMovements("acct", events, []));
    expect(movement.state).toBe("settled");
    expect([...movement.eventIds].sort()).toEqual(["pending-receipt-3000", "settled-receipt-3000", "statement-receipt-3000"]);
    expect(movement.sourceHashes).toHaveLength(3);
    expect(projectPracticeFeedMovements("other", run("receipt-3000", ["settled"]), [])[0]!.id).not.toBe(movement.id);
  });
  it("keeps movements independent and ordered by the catalogue", () => {
    const events = [...run("supplier-refund-540", ["settled"]), ...run("receipt-960", ["pending"]), ...run("receipt-384", ["settled"])];
    const movements = projectPracticeFeedMovements("acct", events, []);
    expect(movements.map((m) => [m.movementKey, m.state, m.kind])).toEqual([
      ["receipt-384", "settled", "customer_receipt"],
      ["receipt-960", "pending", "customer_receipt"],
      ["supplier-refund-540", "settled", "supplier_refund"],
    ]);
    expect(movements.every((m) => m.allocatedEligibleNetPence === 0)).toBe(true);
  });
  it("holds an unknown duplicate and its sibling until reconciled, preserving every source identity", () => {
    const events = run("receipt-384", ["settled", "unknown_duplicate"]);
    const held = projectPracticeFeedMovements("acct", events, []);
    expect(held.map((m) => [m.underlyingMovementId, m.state, m.eligibleForAllocation])).toEqual([
      ["receipt-384", "settled", false],
      ["unresolved-receipt-384", "possible_duplicate", false],
    ]);
    expect(held[1]!.id).toBe("acct:unresolved-receipt-384");
    const merged = only(projectPracticeFeedMovements("acct", events, ["receipt-384"]));
    expect(merged).toMatchObject({ state: "settled", eligibleForAllocation: true, allocatedEligibleNetPence: 0, eventIds: ["settled-receipt-384", "unknown-receipt-384"] });
    // Reconciling a different movement never releases this one.
    expect(projectPracticeFeedMovements("acct", events, ["receipt-960"])).toHaveLength(2);
  });
  it("is order independent and never allocates under seeded random event sequences", () => {
    let seed = 20_261_004;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const steps = practiceFeedStepV1.options;
    for (let round = 0; round < 200; round++) {
      const key = practiceMovementCatalogueV1[Math.floor(next() * practiceMovementCatalogueV1.length)]!.movement;
      const chosen = Array.from({ length: 1 + Math.floor(next() * 6) }, () => steps[Math.floor(next() * steps.length)]!);
      const events = run(key, chosen);
      const reconcile = next() < 0.5 ? [key] : [];
      const shuffled = [...events].sort(() => next() - 0.5);
      const a = projectPracticeFeedMovements("acct", events, reconcile), b = projectPracticeFeedMovements("acct", shuffled, reconcile);
      expect(a.map((m) => [m.id, m.state])).toEqual(b.map((m) => [m.id, m.state]));
      const sawSettled = events.some((e) => e.state === "settled");
      expect(a.length).toBeLessThanOrEqual(2);
      for (const movement of a) {
        expect(movement.allocatedEligibleNetPence).toBe(0);
        if (movement.state === "settled") expect(sawSettled).toBe(true);
        if (sawSettled && movement.underlyingMovementId === key) expect(movement.state).toBe("settled");
      }
    }
  });
});

describe("M4-7-S builder-attested receipts qualify only against a settled movement", () => {
  const view = (movement: PracticeMovementKey, steps: Array<Parameters<typeof generatedPracticeFeedEvents>[1]>, reconciled: PracticeMovementKey[] = []) =>
    projectPracticeFeedMovements("acct", run(movement, steps), reconciled);
  const receipt = (amountPence: number, reversed = false) => ({ paymentId: payment, amountPence, currency: "GBP" as const, reversed });
  it("is attested-only with no feed movement", () => {
    expect(assessAttestedReceipt(receipt(38_400), [], [])).toMatchObject({ status: "attested_only", reason: "no_movement_yet", canMatch: false, candidateMovementKey: "receipt-384" });
  });
  it("is not a candidate for an amount outside the fixed catalogue", () => {
    expect(assessAttestedReceipt(receipt(38_500), view("receipt-384", ["settled"]), [])).toMatchObject({ status: "attested_only", reason: "no_generated_amount", canMatch: false, candidateMovementKey: null });
  });
  it("cannot qualify against a pending movement", () => {
    expect(assessAttestedReceipt(receipt(38_400), view("receipt-384", ["pending"]), [])).toMatchObject({ status: "attested_only", reason: "pending", canMatch: false });
  });
  it("cannot qualify while the matching settled movement is held as a possible duplicate", () => {
    expect(assessAttestedReceipt(receipt(38_400), view("receipt-384", ["settled", "unknown_duplicate"]), [])).toMatchObject({ status: "attested_only", reason: "duplicate_held", canMatch: false });
  });
  it("may be matched once the movement is settled, and qualifies only after the recorded match", () => {
    const movements = view("receipt-384", ["pending", "settled"]);
    expect(assessAttestedReceipt(receipt(38_400), movements, [])).toMatchObject({ status: "attested_only", reason: "ready_to_match", canMatch: true, candidateMovementKey: "receipt-384" });
    expect(assessAttestedReceipt(receipt(38_400), movements, [{ paymentId: payment, movementKey: "receipt-384", paymentReversed: false }]))
      .toMatchObject({ status: "qualifies", matchedMovementKey: "receipt-384", canMatch: false });
  });
  it("one movement verifies one receipt only", () => {
    const movements = view("receipt-384", ["settled"]);
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(assessAttestedReceipt(receipt(38_400), movements, [{ paymentId: other, movementKey: "receipt-384", paymentReversed: false }]))
      .toMatchObject({ status: "attested_only", reason: "movement_already_matched", canMatch: false });
  });
  it("a recorded match stops qualifying while its movement is held by a late duplicate, and qualifies again once reconciled", () => {
    const matched = [{ paymentId: payment, movementKey: "receipt-384" as const, paymentReversed: false }];
    // settle -> match -> an unidentified duplicate arrives: the movement is held, so the saved match cannot be reported as qualifying.
    const held = view("receipt-384", ["settled", "unknown_duplicate"]);
    expect(assessAttestedReceipt(receipt(38_400), held, matched))
      .toMatchObject({ status: "attested_only", reason: "duplicate_held", canMatch: false, matchedMovementKey: "receipt-384", candidateMovementKey: "receipt-384" });
    // The match is history and is preserved: reconciliation restores qualification without a new match.
    expect(assessAttestedReceipt(receipt(38_400), view("receipt-384", ["settled", "unknown_duplicate"], ["receipt-384"]), matched))
      .toMatchObject({ status: "qualifies", reason: "matched", matchedMovementKey: "receipt-384" });
  });
  it("a recorded match is never reported as qualifying unless its movement is currently settled", () => {
    const matched = [{ paymentId: payment, movementKey: "receipt-384" as const, paymentReversed: false }];
    expect(assessAttestedReceipt(receipt(38_400), [], matched)).toMatchObject({ status: "attested_only", reason: "no_movement_yet", matchedMovementKey: "receipt-384" });
    expect(assessAttestedReceipt(receipt(38_400), view("receipt-384", ["pending"]), matched)).toMatchObject({ status: "attested_only", reason: "pending" });
  });
  it("explains that the receipt which used a movement was reversed, instead of saying another receipt uses it", () => {
    const movements = view("receipt-384", ["settled"]);
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(assessAttestedReceipt(receipt(38_400), movements, [{ paymentId: other, movementKey: "receipt-384", paymentReversed: true }]))
      .toMatchObject({ status: "attested_only", reason: "movement_used_by_reversed_receipt", canMatch: false, candidateMovementKey: "receipt-384" });
    expect(assessAttestedReceipt(receipt(38_400), movements, [{ paymentId: other, movementKey: "receipt-384", paymentReversed: false }]))
      .toMatchObject({ reason: "movement_already_matched" });
  });
  it("a reversed receipt never qualifies, even if it was matched", () => {
    const movements = view("receipt-384", ["settled"]);
    expect(assessAttestedReceipt(receipt(38_400, true), movements, [{ paymentId: payment, movementKey: "receipt-384", paymentReversed: false }])).toMatchObject({ status: "reversed", canMatch: false });
  });
  it("a supplier refund can never verify a customer receipt", () => {
    expect(assessAttestedReceipt(receipt(54_000), view("supplier-refund-540", ["settled"]), [])).toMatchObject({ status: "attested_only", reason: "no_generated_amount", canMatch: false, candidateMovementKey: null });
  });
  it("every customer-receipt movement is a candidate for exactly its own amount", () => {
    for (const entry of practiceMovementCatalogueV1.filter((item) => item.kind === "customer_receipt")) {
      expect(assessAttestedReceipt(receipt(entry.grossPence), view(entry.movement, ["settled"]), [])).toMatchObject({ canMatch: true, candidateMovementKey: entry.movement });
    }
  });
});
