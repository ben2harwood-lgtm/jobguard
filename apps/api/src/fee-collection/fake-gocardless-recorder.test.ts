import { describe, expect, it, vi } from "vitest";
import { FakeGoCardlessRail } from "./fake-gocardless.js";
const tenantId = "10000000-0000-4000-8000-000000000001";
const event = { version: "fake-dd-mandate-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
  tenantId, mandateId: tenantId, eventId: tenantId, state: "created" };
describe("fake DD signed recorder boundary", () => {
  it("authenticates the exact body before calling the recorder", async () => {
    const record = vi.fn();
    const rail = new FakeGoCardlessRail("fictional", undefined, { record });
    const body = JSON.stringify({ events: [event] });
    for (const signature of ["", new FakeGoCardlessRail("foreign").sign(body), rail.sign(body + " "), rail.sign(body, 1)]) {
      await expect(rail.recordWebhookBatch(body, signature)).rejects.toThrow("INVALID_WEBHOOK");
    }
    expect(record).not.toHaveBeenCalled();
  });
  it("processes each schema-valid member independently and returns the store answer", async () => {
    const answer = { code: "processed" as const, eventIds: [tenantId] };
    const record = vi.fn().mockRejectedValueOnce(new Error("private failure")).mockResolvedValue(answer);
    const rail = new FakeGoCardlessRail("fictional", undefined, { record });
    const body = JSON.stringify({ events: [{ ...event, account: "foreign" }, event, { ...event, eventId: "20000000-0000-4000-8000-000000000001" }] });
    expect(await rail.recordWebhookBatch(body, rail.sign(body))).toEqual([
      { code: "INVALID_WEBHOOK" }, { code: "INVALID_WEBHOOK" }, answer]);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0]).toEqual([event]);
  });
  it("refuses recording without an explicit port", async () => {
    const rail = new FakeGoCardlessRail("fictional");
    const body = JSON.stringify({ events: [event] });
    expect(await rail.recordWebhookBatch(body, rail.sign(body))).toEqual([{ code: "COLLECTION_REFUSED" }]);
  });
});
