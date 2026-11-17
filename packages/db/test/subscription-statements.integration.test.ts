import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refreshMeter } from "./meter-persistence-fixtures.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { approvedSimulation, calendarInput, command, correctionPeriod, count, historicalAgreement, issue, meterCompany, meterInput, preparedPeriod, rows, storeMeter } from "./subscription-persistence-fixtures.js";

// Multi-period/correction scenarios below have bounded 120s budgets for real PostgreSQL CI.
// Their full month inputs, deferred integrity checks and assertions remain enabled.
describe("MON-2A-P hypothetical statements and simulated outcomes", () => {
 let f: WorkFixture; beforeAll(async () => { f = await createWorkFixture(); }, 60000); afterAll(async () => closeWorkFixture(f));
 it("correction-inclusive issue never exceeds maximum", async () => {
  for (const places of [7, 8, 11, 12, 17]) {
   const { a, issued } = await correctionPeriod(f, places);
   expect(issued.amountPence).toBeLessThanOrEqual(16900);
   expect(issued.amountPence).toBe(Math.min(16900, 6900 + Math.min(5, Math.max(0, places - 7)) * 2000 + 2000));
   expect(await count(f, a, "subscription_correction_disposition")).toBe(1);
  }
 }, 120000);
 it("excess remains uncollected and alerted", async () => {
  const { a, issued } = await correctionPeriod(f);
  expect(issued.amountPence).toBe(16900);
  const dispositions = await rows(f, a, "subscription_correction_disposition");
  expect(dispositions).toHaveLength(1);
  expect(Number(dispositions[0].full_pence)).toBe(2000); expect(Number(dispositions[0].applied_pence)).toBe(0); expect(Number(dispositions[0].excess_pence)).toBe(2000);
  expect((await rows(f, a, "subscription_alert")).map(row => row.code)).toContain("CORRECTION_EXCESS_UNCOLLECTED");
 }, 120000);
 it("lines sum exactly and never contain fee sources", async () => {
  const { a, issued } = await preparedPeriod(f);
  const lines = await rows(f, a, "platform_statement_line"), statement = (await rows(f, a, "platform_statement"))[0];
  expect(lines.reduce((sum, line) => sum + Number(line.amount_pence), 0)).toBe(issued.amountPence);
  expect(statement).toMatchObject({ hypothetical: true, namespace: "subscription.synthetic.v1", currency: "GBP" });
  expect((await rows(f, a, "subscription_period_line")).every(line => ["plan", "extra", "correction"].includes(line.kind))).toBe(true);
  expect(JSON.stringify(lines)).not.toMatch(/recovery|success.fee|vat/iu);
 });
 it("redirect never settles", async () => {
  const { a, approved } = await approvedSimulation(f);
  await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
  await command(f, a, { version: "subscription-command.v1", kind: "record_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "redirect", expectedRevision: 1 });
  expect((await rows(f, a, "subscription_simulated_result")).map(row => row.outcome)).toEqual(["redirect"]);
 });
 it("duplicate simulated result has one effect", async () => {
  const { a, approved } = await approvedSimulation(f);
  await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
  const value = { version: "subscription-command.v1", kind: "record_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "settled", expectedRevision: 1 }, id = randomUUID();
  const first = await command(f, a, value, id); expect(await command(f, a, value, id)).toEqual(first);
  expect(await count(f, a, "subscription_simulated_result")).toBe(1);
  expect((await rows(f, a, "subscription_simulated_result"))[0]).toMatchObject({ environment: "synthetic_demo", outcome: "settled" });
 });
 it("unknown outcome cannot blindly retry", async () => {
  const { a, approved } = await approvedSimulation(f);
  const execute = { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 };
  await command(f, a, execute);
  await command(f, a, { version: "subscription-command.v1", kind: "record_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "outcome_unknown", expectedRevision: 1 });
  await expect(command(f, a, execute)).rejects.toThrow();
  await command(f, a, { version: "subscription-command.v1", kind: "reconcile_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "settled", expectedRevision: 1 });
  expect((await rows(f, a, "subscription_simulated_result")).some(row => row.outcome === "settled" && row.reconciled)).toBe(true);
 });
 it("review creates one Decision and operations card without moving track", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  await storeMeter(f, a, calendarInput(a.tenantId, 13, 9)); await issue(f, a);
  expect(await count(f, a, "subscription_review")).toBe(0);
  await storeMeter(f, a, calendarInput(a.tenantId, 14, 10)); await issue(f, a, "2026-10-01"); await issue(f, a, "2026-10-01");
  expect(await count(f, a, "subscription_review")).toBe(1); expect(await count(f, a, "subscription_operations_card")).toBe(1);
  const review = (await rows(f, a, "subscription_review"))[0]; expect(review).toMatchObject({ mandatory: true, immediate: true });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.decision WHERE tenant_id=$1 AND id=$2", [a.tenantId, review.decision_id])).rows[0].n).toBe(1);
  expect((await rows(f, a, "subscription_agreement_revision")).map(row => row.plan)).toEqual(["Builder"]);
  const b = await meterCompany(f); await historicalAgreement(f, b);
  for (const month of [9, 10, 11]) { const input = calendarInput(b.tenantId, month === 10 ? 7 : 8, month); await storeMeter(f, b, input); await issue(f, b, input.startDate); }
  const sustained = (await rows(f, b, "subscription_review"))[0]; expect(sustained).toMatchObject({ sustained: true, immediate: false });
 }, 120000);
 it("negative correction stays linked without refund or future credit", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  const old = meterInput(a.tenantId, 8); await storeMeter(f, a, old); await refreshMeter(f, a);
  old.days.forEach(day => { day.jobs = day.jobs.slice(0, 7); }); await storeMeter(f, a, old); await refreshMeter(f, a);
  await storeMeter(f, a, calendarInput(a.tenantId, 7, 10));
  expect((await issue(f, a, "2026-10-01")).amountPence).toBe(6900);
  const negative = (await rows(f, a, "subscription_correction_disposition"))[0];
  expect(Number(negative.full_pence)).toBe(-2000); expect(Number(negative.applied_pence)).toBe(0); expect(Number(negative.excess_pence)).toBe(0);
  expect((await rows(f, a, "subscription_alert")).map(row => row.code)).toContain("NEGATIVE_CORRECTION_POLICY_HOLD");
  await storeMeter(f, a, calendarInput(a.tenantId, 7, 11));
  expect((await issue(f, a, "2026-11-01")).amountPence).toBe(6900);
  expect(await count(f, a, "subscription_correction_disposition")).toBe(1);
 }, 120000);

 it("crossing grace records review before issue and later issue reuses it", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  const graceInput = calendarInput(a.tenantId, 13, 9), sourceAtGrace = await storeMeter(f, a, graceInput);
  const request = (sourceId: string) => ({ version: "subscription-command.v1", kind: "review", sourceId, expectedRevision: 1 });
  expect((await command(f, a, request(sourceAtGrace))).trackReviewDue).toBe(false);
  const extra = { tenantId: a.tenantId, jobId: randomUUID(), customerId: randomUUID(), siteId: randomUUID(), small: false };
  graceInput.days.forEach(day => day.jobs.push(extra));
  const crossedSource = await storeMeter(f, a, graceInput), first = await command(f, a, request(crossedSource));
  expect(first).toMatchObject({ trackReviewDue: true, immediate: true, trackChanged: false });
  expect(await count(f, a, "subscription_period")).toBe(0);
  const review = (await rows(f, a, "subscription_review"))[0];
  expect(review).toMatchObject({ period_id: null, source_id: crossedSource, mandatory: true });
  expect((await command(f, a, request(crossedSource))).reviewId).toBe(first.reviewId);
  expect(await count(f, a, "subscription_operations_card")).toBe(1);
  expect((await issue(f, a)).amountPence).toBe(16900);
  expect(await rows(f, a, "subscription_review")).toEqual([review]);
 }, 120000);
 it("late correction refuses an already issued receiving subscription period", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  const original = meterInput(a.tenantId, 7); await storeMeter(f, a, original); await refreshMeter(f, a);
  await storeMeter(f, a, calendarInput(a.tenantId, 8, 10)); await issue(f, a, "2026-10-01");
  const before = await rows(f, a, "subscription_period"), computations = await rows(f, a, "meter_computation");
  const extra = { tenantId: a.tenantId, jobId: randomUUID(), customerId: randomUUID(), siteId: randomUUID(), small: false };
  original.days.forEach(day => day.jobs.push(extra)); await storeMeter(f, a, original);
  await expect(refreshMeter(f, a)).rejects.toThrow("METER_CORRECTION_PERIOD_CLOSED");
  expect(await rows(f, a, "subscription_period")).toEqual(before);
  expect(await rows(f, a, "meter_computation")).toEqual(computations);
  expect(await count(f, a, "meter_correction")).toBe(0);
 });

 it("interrupted simulated attempts reconcile without a second execution",async()=>{
  const {a,approved}=await approvedSimulation(f);
  await command(f,a,{version:"subscription-command.v1",kind:"execute_simulation",workId:approved.workId,expectedRevision:1});
  await expect(command(f,a,{version:"subscription-command.v1",kind:"execute_simulation",workId:approved.workId,expectedRevision:1})).rejects.toThrow();
  expect(await command(f,a,{version:"subscription-command.v1",kind:"reconcile_simulation",workId:approved.workId,resultId:randomUUID(),outcome:"settled",expectedRevision:1})).toMatchObject({settled:true});
  expect(await count(f,a,"subscription_simulated_attempt")).toBe(1);
 });

 it("reconciliation may observe the identical still-unknown provider result",async()=>{
  const {a,approved}=await approvedSimulation(f),resultId=randomUUID();
  await command(f,a,{version:"subscription-command.v1",kind:"execute_simulation",workId:approved.workId,expectedRevision:1});
  const result={version:"subscription-command.v1",workId:approved.workId,resultId,outcome:"outcome_unknown",expectedRevision:1};
  await command(f,a,{...result,kind:"record_simulation"});
  expect(await command(f,a,{...result,kind:"reconcile_simulation"})).toMatchObject({settled:false,outcome:"outcome_unknown"});
  expect(await count(f,a,"subscription_simulated_result")).toBe(1);
 });

});
