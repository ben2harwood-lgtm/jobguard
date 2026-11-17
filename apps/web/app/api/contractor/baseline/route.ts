import "server-only";
import { EnterpriseBaselineApplication } from "@jobguard/api/workspace";
import { enterpriseRequest } from "../../../lib/enterprise-dashboard-server";
import { syntheticPool } from "../../../lib/synthetic-server";
export async function POST(request: Request) {
  return enterpriseRequest(request, (principal, body) => new EnterpriseBaselineApplication(syntheticPool()).import(principal, body));
}
