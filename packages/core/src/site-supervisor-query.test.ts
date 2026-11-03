import { expect, it } from "vitest";
import { recordSiteSupervisorQueryV1, siteSupervisorQueryV1 } from "./site-extra-pricing.js";
const id = "11111111-1111-4111-8111-111111111111";
const body = { version: "record-site-supervisor-query.v1", commandId: id, orderLineScopeItemId: id, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: id };
it("accepts only the versioned within-order question", () => { expect(recordSiteSupervisorQueryV1.parse(body)).toEqual(body); });
it.each(["tenantId", "actor", "operativeMembershipId", "role", "time", "origin", "price", "amount", "netPence", "jobId", "state"])("refuses raw authority/amount %s", field => {
 expect(recordSiteSupervisorQueryV1.safeParse({ ...body, [field]: "forged" }).success).toBe(false);
});
it.each(["0", "-1", "1e2", "1.0000001", 1, null])("refuses invalid claimed quantity %s", quantity => {
 expect(recordSiteSupervisorQueryV1.safeParse({ ...body, quantity }).success).toBe(false);
});
it("cannot represent an extra or price in a query answer", () => {
 const answer = { version: "site-supervisor-query.v1", environment: "synthetic_demo", realExternalActions: 0, queryId: id, jobId: id, orderLineScopeItemId: id, sorCode: "FIT-LOCK", quantity: "1", orderRevisionId: id, operativeMembershipId: id, recordedAt: "2026-11-03T10:00:00.000Z" };
 expect(siteSupervisorQueryV1.parse(answer)).toEqual(answer);
 expect(siteSupervisorQueryV1.safeParse({ ...answer, extraId: id }).success).toBe(false);
 expect(siteSupervisorQueryV1.safeParse({ ...answer, price: { pence: 100 } }).success).toBe(false);
});
