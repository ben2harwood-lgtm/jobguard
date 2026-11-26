import { CustomerSigninApplication, customerHttp } from "@jobguard/api/identity";
import { customerPortalRequest } from "../../../lib/customer-portal-server";
export async function POST(request: Request) {
  return customerPortalRequest(request, identityApplication => customerHttp(() => new CustomerSigninApplication(identityApplication(), process.env.JOBGUARD_ENV), "read", request));
}
