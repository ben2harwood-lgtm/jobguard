import { CustomerSigninApplication, customerHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
export async function POST(request: Request) {
  return customerHttp(() => new CustomerSigninApplication(identityApplication(), process.env.JOBGUARD_ENV), "read", request);
}
