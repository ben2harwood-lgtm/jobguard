import { CustomerMessageApplication, customerMessageHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
export async function POST(request: Request) {
  return customerMessageHttp(() => new CustomerMessageApplication(identityApplication(), process.env.JOBGUARD_ENV), request);
}
