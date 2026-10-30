import "server-only";
import { z } from "zod";
import { dashboardQueryV1, dashboardParse } from "@jobguard/core";
import { EnterpriseDashboardApplication } from "@jobguard/api/workspace";
import { enterpriseRequest } from "../../../lib/enterprise-dashboard-server";
import { syntheticPool } from "../../../lib/synthetic-server";
const requestV1 = z.object({ version: z.literal("enterprise-dashboard-request.v1"), resource: z.enum(["activity", "billing"]), query: dashboardQueryV1 }).strict();
export async function POST(request: Request) {
  return enterpriseRequest(request, async (principal, body) => {
    const input = dashboardParse(requestV1, body), application = new EnterpriseDashboardApplication(syntheticPool());
    return input.resource === "activity" ? application.read(principal, input.query) : application.readBilling(principal, input.query);
  });
}
