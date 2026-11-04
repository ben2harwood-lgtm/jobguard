import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteChange, routeRefusals } from "./route-change";
import { routeApprovalV1, routeReadV1 } from "@jobguard/api/accounting-export-contracts";
it("labels the read-only practice screen and preserved history before any approval", () => {
 const html = renderToStaticMarkup(createElement(RouteChange, { sourceId: "demo-next", tenantId: "tenant", csrfToken: "csrf" }));
 expect(html).toContain("Practice export route change");
 expect(html).toContain("History is kept. Already-sent items are not sent again.");
 expect(html).not.toContain("Confirm this exact route change");
});
it("has plain refusals for stale connection/consent, uncertain exports and reused or expired approvals", () => {
 for (const code of ["EXPORT_CONSENT_EXPIRED", "EXPORT_STALE_REVISION", "EXPORT_RECONCILE_REQUIRED", "EXPORT_APPROVAL_REQUIRED", "EXPORT_REPLAY_CONFLICT"])
  expect(routeRefusals[code]).toMatch(/[a-z] /);
 expect(routeReadV1.safeParse({ version: 1, proposal: null, confirmed: null, history: [], tenantId: "injected" }).success).toBe(false);
 expect(routeApprovalV1.safeParse({ version: 1, actorId: "injected" }).success).toBe(false);
});
