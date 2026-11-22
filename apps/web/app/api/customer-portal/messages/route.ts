import { CustomerMessageApplication, customerMessageHttp } from "@jobguard/api/identity";
import { customerPortalRequest } from "../../../lib/customer-portal-server";
export async function POST(request: Request) {
  return customerPortalRequest(request, identityApplication => customerMessageHttp(() => new CustomerMessageApplication(identityApplication(), process.env.JOBGUARD_ENV), request));
}
