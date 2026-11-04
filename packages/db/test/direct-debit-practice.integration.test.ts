import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { issuePracticeSession, authorizePracticeJob, authenticatePracticeSession } from "../src/practice-session.js";
import { DirectDebitFixtureRepository } from "../src/direct-debit-fixture-repository.js";
import { DirectDebitPracticeApplication } from "../../../apps/api/src/fee-collection/direct-debit-practice.application.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("stores the practice lifecycle through the application, refreshes/replays identically, and refuses foreign/unreadable jobs before fixture reads", async () => {
  const token = await issuePracticeSession(c.runtime), auth = await authenticatePracticeSession(c.runtime, token);
  const jobId = randomUUID();
  // Owner fixture: only the existing immutable practice ownership contract is used.
  await c.admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional debit practice',$3,'home')", [jobId, auth.context.tenantId, auth.digest]);
  const repository = new DirectDebitFixtureRepository(c.runtime), spy = vi.spyOn(repository, "read");
  const app = () => new DirectDebitPracticeApplication(repository, async (actor, id) => {
    const current = await authorizePracticeJob(c.runtime, token, id);
    expect(auth.context.tenantId).toBe(current.context.tenantId);
    expect(actor.membershipId).toBe(current.membershipId);
  }, "synthetic_demo");
  const actor = { membershipId: auth.membershipId, identityUserId: auth.identityUserId };
  const run = (raw?: unknown) => app().execute(auth.context, actor, jobId, raw);
  let view = await run();
  const labels: string[] = [];
  while (view.nextAction) {
    const action = view.nextAction;
    view = await run(action);
    expect(await run(action)).toEqual(view); // signed duplicate path through a fresh application/rail
    expect(await run()).toEqual(view);
    labels.push(view.history.at(-1)!.label);
  }
  expect(labels).toContain("Payment requested — not paid");
  expect(labels).toContain("Collection confirmed — awaiting payout");
  expect(labels).toContain("Payment paid out"); expect(labels).toContain("Payment failed");
  expect(labels).toContain("Payment charged back"); expect(labels).toContain("Payment cancelled");
  expect(labels).toContain("Payment failed after confirmation");
  expect(view.mandate).toBe("Mandate cancelled or revoked"); expect(view.blocksNewCollection).toBe(true);
  expect(view.payments[1]?.label).toContain("retry example");
  expect(JSON.stringify(view)).not.toMatch(/secret|signature|objectId|account|tenantId|bank/i);
  const foreignToken = await issuePracticeSession(c.runtime), foreign = await authenticatePracticeSession(c.runtime, foreignToken);
  const otherJob = randomUUID();
  await c.admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Other fictional job',$3,'home')", [otherJob, foreign.context.tenantId, foreign.digest]);
  const otherCompany = await meterCompany(c as unknown as WorkFixture);
  spy.mockClear();
  for (const hidden of [otherJob, otherCompany.jobId, randomUUID()]) await expect(app().execute(auth.context, actor, hidden)).rejects.toThrow("NOT_FOUND");
  expect(spy).not.toHaveBeenCalled();
});
