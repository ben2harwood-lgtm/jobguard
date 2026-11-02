// CI ONLY: execute the actual migration's capacity predicate in PostgreSQL.
// CTEs supply fictional allocation rows without disabling any production constraints.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, type FinalCheckFixture } from "./final-check-fixture.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { if (f) await closeFinalCheckFixture(f); });
const sql = readFileSync(new URL("../migrations/0547_success_fee_cap_nets_reversals.sql", import.meta.url), "utf8");
const predicate = sql.match(/  IF (\(SELECT coalesce\(sum\(greatest[\s\S]*?)\n  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'/u)![1]!
 .replaceAll("app.recovery_case_allocation_reversal", "reversals")
 .replaceAll("app.recovery_case_allocation", "allocations")
 .replaceAll("landing.case_id", "'case-a'").replaceAll("landing.payment_id", "'payment-a'")
 .replaceAll("rc.claim_pence", "$3::bigint").replaceAll("eligibility.eligible_net_pence", "$4::bigint")
 .replaceAll("movement.gross_pence", "$5::bigint")
 .replace(/\bca.tenant_id=t\b/gu, "ca.tenant_id='tenant-a'")
 .replace(/\bca.job_id=p_job\b/gu, "ca.job_id='job-a'");
type Allocation = { id: string; tenant_id: string; job_id: string; case_id: string; payment_id: string; eligible_net_pence: number; gross_pence: number };
type Reversal = Pick<Allocation, "tenant_id" | "job_id" | "eligible_net_pence" | "gross_pence"> & { allocation_id: string };
const allocation = (id: string, net = 100, gross = 120): Allocation => ({ id, tenant_id: "tenant-a", job_id: "job-a", case_id: "case-a", payment_id: "payment-a", eligible_net_pence: net, gross_pence: gross });
const reversal = (net = 100, gross = 120): Reversal => ({ allocation_id: "old", tenant_id: "tenant-a", job_id: "job-a", eligible_net_pence: net, gross_pence: gross });
async function exceeds(allocations: Allocation[], reversals: Reversal[], claim = 100, eligible = 100, movement = 120) {
 const result = await f.admin.query(`WITH
 allocations AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS a(id text,tenant_id text,job_id text,case_id text,payment_id text,eligible_net_pence bigint,gross_pence bigint)),
 reversals AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS r(allocation_id text,tenant_id text,job_id text,eligible_net_pence bigint,gross_pence bigint))
 SELECT ${predicate} AS excess`, [JSON.stringify(allocations), JSON.stringify(reversals), claim, eligible, movement]);
 return result.rows[0].excess;
}
it("allows full reversal followed by equal reallocation", async () => {
 expect(await exceeds([allocation("old"), allocation("new")], [reversal()])).toBe(false);
});
it("still refuses reallocation above either claim or approved eligible principal", async () => {
 const rows = [allocation("old"), allocation("new", 101, 120)];
 expect(await exceeds(rows, [reversal()])).toBe(true);
 expect(await exceeds(rows, [reversal()], 200, 100)).toBe(true);
});
it("partial reversals free only the reversed amount", async () => {
 expect(await exceeds([allocation("old"), allocation("new", 40, 48)], [reversal(40, 48)])).toBe(false);
 expect(await exceeds([allocation("old"), allocation("new", 41, 49)], [reversal(40, 48)])).toBe(true);
});
it.each(["tenant_id", "job_id", "allocation_id"] as const)("a different %s cannot free capacity", async key => {
 expect(await exceeds([allocation("old"), allocation("new")], [{ ...reversal(), [key]: "other" }])).toBe(true);
});
it("nets per allocation, never lets excess or duplicate reversals hide another allocation's excess", async () => {
 const rows = [allocation("old"), allocation("new", 101, 121)];
 expect(await exceeds(rows, [reversal(), reversal()])).toBe(true);
 expect(await exceeds(rows, [reversal(200, 240)])).toBe(true);
});
it("refuses movement gross excess even when net remains within the claim", async () => {
 expect(await exceeds([allocation("old"), allocation("new", 100, 121)], [reversal()])).toBe(true);
});
it("review and approval command replays keep one derivation and journal", async () => {
 const x = await recoveryFeeFixture(f);
 await x.allocate(0);
 const command = { version: "success-fee-command.v1", action: "review", commandId: randomUUID(), expectedPostingRevision: 0 };
 const review = await x.fees.command(x.context, x.jobId, x.auth.digest, command);
 expect(await x.fees.command(x.context, x.jobId, x.auth.digest, command)).toEqual({ ...review, replayed: true });
 const approve = { ...command, action: "approve", commandId: randomUUID(), reviewId: review.reviewId, statementHash: review.statementHash };
 const posted = await x.fees.command(x.context, x.jobId, x.auth.digest, approve);
 expect(await x.fees.command(x.context, x.jobId, x.auth.digest, approve)).toEqual({ ...posted, replayed: true });
 for (const table of ["success_fee_derivation", "success_fee_journal"]) {
  expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [x.context.tenantId, x.jobId])).rows).toEqual([{ n: 1 }]);
 }
});
