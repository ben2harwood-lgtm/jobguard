import { CustomerStagesApplication, customerStagesHttp } from "@jobguard/api/identity";
import { customerPortalRequest } from "../../../lib/customer-portal-server";
export async function POST(request: Request) {
  return customerPortalRequest(request, identityApplication => customerStagesHttp(() => new CustomerStagesApplication(identityApplication(), process.env.JOBGUARD_ENV), "stage-acknowledge", request));
}
