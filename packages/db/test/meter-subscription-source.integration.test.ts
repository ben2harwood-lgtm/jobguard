import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SubscriptionMeterSource } from "../src/subscription-meter-source.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { historicalAgreement, meterCompany, meterInput, storeMeter } from "./subscription-persistence-fixtures.js";

// Compatibility evidence for the existing supplied-source version only.
// Does not claim lifecycle-source pricing while MON1-L returns unknown counts.
describe("MON1-I existing subscription source compatibility", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("fresh readers use accepted terms and never expose another company's source", async () => {
  const a = await meterCompany(f), b = await meterCompany(f);
  await historicalAgreement(f, a, "Solo");
  const input = meterInput(a.tenantId, 5); // deliberately supplied Builder days
  const sourceId = await storeMeter(f, a, input);
  const first = await new SubscriptionMeterSource(f.runtime).read(a.context, a.digest, sourceId);
  expect(first.result.principal).toEqual({ pence: 4900, currency: "GBP" });
  expect(first).toEqual(await new SubscriptionMeterSource(f.runtime).read(a.context, a.digest, sourceId));
  await expect(new SubscriptionMeterSource(f.runtime).read(b.context, b.digest, sourceId))
   .rejects.toMatchObject({ code: "SUBSCRIPTION_UNAVAILABLE" });
  // Checked SQL replaces supplied plan labels with effective accepted terms.
  const client = await f.runtime.connect();
  try {
   await client.query("BEGIN");
   await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   const source = (await client.query("SELECT app.mon2_source($1,$2,$3) result", [a.tenantId, a.digest, sourceId])).rows[0].result;
   expect(source.version).toBe("meter-persisted-fixture.v1");
   expect(source.days).toHaveLength(30);
   expect(source.days.every((day: { plan: string }) => day.plan === "Solo")).toBe(true);
  } finally { await client.query("ROLLBACK"); client.release(); }
 });
});
