import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SubscriptionStripeSandboxAdapter, signSubscriptionSandboxEvent } from "../src/subscription-stripe-sandbox-adapter.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { approvedSimulation, command, count, meterCompany, readSubscription } from "./subscription-persistence-fixtures.js";

describe("MON-2B signed fake provider PostgreSQL effects (sandbox evidence only)", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(); }, 60000);
  afterAll(async () => closeWorkFixture(f));
  it("unknown claim reconciles once; duplicate signed events cannot duplicate settlement", async () => {
    const { a, approved } = await approvedSimulation(f);
    const claim = await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
    const work = { version: "subscription-simulated-work.v1", environment: "synthetic_demo", workId: claim.workId, statementId: claim.statementId,
      amountPence: claim.amountPence, contentHash: claim.contentHash, currency: "GBP" };
    const adapter = new SubscriptionStripeSandboxAdapter({ version: "subscription-stripe-sandbox-binding.v1", tenantId: a.tenantId, work, collectionBoundPence: 16900 });
    const unknown = await adapter.execute(work);
    await command(f, a, { version: "subscription-command.v1", kind: "record_simulation", workId: unknown.workId, resultId: unknown.resultId, outcome: unknown.outcome, expectedRevision: 1 });
    const signed = signSubscriptionSandboxEvent({ version: "subscription-stripe-sandbox-event.v1", id: randomUUID(), livemode: false, tenantId: a.tenantId,
      type: "payment_intent.succeeded", data: work });
    adapter.ingest(signed);
    const settled = await adapter.reconcile(work);
    const value = { version: "subscription-command.v1", kind: "reconcile_simulation", workId: settled.workId, resultId: settled.resultId, outcome: settled.outcome, expectedRevision: 1 };
    const id = randomUUID();
    const first = await command(f, a, value, id);
    const audits = await count(f, a, "audit_event");
    adapter.ingest(signed);
    expect(await adapter.reconcile(work)).toEqual(settled);
    expect(await command(f, a, value, id)).toEqual(first);
    expect(await count(f, a, "audit_event")).toBe(audits);
    expect(first.settled).toBe(true);
    const snapshot = await readSubscription(f, a);
    expect(snapshot.attempts).toHaveLength(1);
    expect(snapshot.results.filter((row: { outcome: string }) => row.outcome === "settled")).toHaveLength(1);
    const other = await meterCompany(f);
    await expect(command(f, other, value)).rejects.toThrow();
    await expect(command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 })).rejects.toThrow();
  });
});
