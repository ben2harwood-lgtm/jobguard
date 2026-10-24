import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeAccess } from "../practice-access.js";
import { ValueV3Application, heldJobValueV3, valueJobResponseV3 } from "./value-v3.application.js";

const jobId = randomUUID();
const pool = {} as Pool;
function fixture() {
 const authority = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as Awaited<ReturnType<PracticeAccess["job"]>>);
 const readJob = vi.fn<() => Promise<unknown>>(async () => heldJobValueV3(jobId));
 return { authority, readJob, app: new ValueV3Application(pool, randomUUID(), { readJob }) };
}
afterEach(() => vi.restoreAllMocks());

it("CH9-J01 authorizes before query validation or producer data and repeats authority on reload", async () => {
 const { authority, readJob, app } = fixture();
 await app.readJob(jobId); await app.readJob(jobId);
 expect(authority).toHaveBeenCalledTimes(2);
 expect(authority.mock.invocationCallOrder[0]).toBeLessThan(readJob.mock.invocationCallOrder[0]!);
 authority.mockRejectedValueOnce(Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" }));
 await expect(app.readJob(jobId, { tenantId: "forged" })).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect(readJob).toHaveBeenCalledTimes(2);
});
it.each(["foreign session", "foreign tenant", "foreign job", "foreign imported descendant"])("CH9-J02 denies %s before source reads", async () => {
 const { authority, readJob, app } = fixture();
 authority.mockRejectedValue(Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" }));
 await expect(app.readJob(jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect(readJob).not.toHaveBeenCalled();
});
it.each([{ from: "2026-01-01T00:00:00Z" }, { toExclusive: "2026-02-01T00:00:00Z" }, { fee: 0 }, { periodId: randomUUID() }, null, []])("unbound time/authority selections are rejected: %j", async query => {
 const { app, readJob } = fixture();
 await expect(app.readJob(jobId, query)).rejects.toMatchObject({ code: "VALUE_V3_QUERY_UNBOUND" });
 expect(readJob).not.toHaveBeenCalled();
});
it("CH9-J03/05 HELD read has no hidden count/source fields or write port", async () => {
 const { app } = fixture();
 const first = await app.readJob(jobId);
 expect(await app.readJob(jobId)).toEqual(first);
 expect(first).toEqual(heldJobValueV3(jobId));
 expect(first).not.toHaveProperty("sources");
 expect(first).not.toHaveProperty("checkedCount");
 expect(Object.getOwnPropertyNames(ValueV3Application.prototype).sort()).toEqual(["constructor", "readJob"]);
});
it.each(["CH9-J04", "CH9-J06", "CH9-J09", "CH9-J11"])("%s cannot promote missing provenance/commands/reversal/vector to money or a receipt", async () => {
 const { app } = fixture();
 expect(await app.readJob(jobId)).toMatchObject({ status: "incomplete", reason: "producer_bindings_held", receipt: null, asOf: null,
  producers: { sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD" } });
});
it("CH9-J07 refuses subscription allocations and all supplied tracked qualifying/remainder values rather than stripping them", async () => {
 const { app, readJob } = fixture();
 for (const extra of [{ subscription: { pence: 100 } }, { tracked: { qualifying: 100, remainder: 100 } }, { sources: [] }, { receipt: "fabricated" }]) {
  readJob.mockResolvedValueOnce({ ...heldJobValueV3(jobId), ...extra });
  await expect(app.readJob(jobId)).rejects.toMatchObject({ code: "VALUE_V3_SOURCE_REJECTED", status: "incomplete" });
 }
});
it("CH9-J08 keeps a distinct v3 response without claiming the v1 snapshot", async () => {
 const { app } = fixture();
 expect(valueJobResponseV3.safeParse(await app.readJob(jobId)).success).toBe(true);
 expect(valueJobResponseV3.safeParse({ ...heldJobValueV3(jobId), version: "job-value.v1" }).success).toBe(false);
});
it("fractional Q arriving from a port is incomplete, never rounded or discarded", async () => {
 const { app, readJob } = fixture();
 readJob.mockResolvedValueOnce({ ...heldJobValueV3(jobId), qualifying: { pence: 20000 / 43, currency: "GBP" } });
 await expect(app.readJob(jobId)).rejects.toMatchObject({ status: "incomplete", code: "VALUE_V3_SOURCE_REJECTED" });
});
it("rejects mismatched job scope and producer promotion", async () => {
 const { app, readJob } = fixture();
 readJob.mockResolvedValueOnce(heldJobValueV3(randomUUID()));
 await expect(app.readJob(jobId)).rejects.toMatchObject({ code: "VALUE_V3_SOURCE_REJECTED" });
 readJob.mockResolvedValueOnce({ ...heldJobValueV3(jobId), status: "complete" });
 await expect(app.readJob(jobId)).rejects.toMatchObject({ code: "VALUE_V3_SOURCE_REJECTED" });
});
it("missing composition is explicitly held after authority", async () => {
 fixture();
 expect(await new ValueV3Application(pool, randomUUID()).readJob(jobId)).toEqual(heldJobValueV3(jobId));
});
it("CH9-J10 server copy makes no ownership/settlement/prevention-money claim", async () => {
 const { app } = fixture();
 const text = JSON.stringify(await app.readJob(jobId));
 expect(text).not.toMatch(/£|saved you|would have forgotten|you(?:’|')?ll|\bwill\b|get to keep|\bretain\b|belongs to you|your money|goes to you|take.home|pocket|\bowed\b|\bcharged\b|\bpaid\b/i);
});
