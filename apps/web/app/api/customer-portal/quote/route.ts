import { CustomerQuoteApplication, customerQuoteHttp } from "@jobguard/api/identity";
import { customerPortalRequest } from "../../../lib/customer-portal-server";
export async function POST(request: Request) {
  return customerPortalRequest(request, identityApplication => customerQuoteHttp(() => new CustomerQuoteApplication(identityApplication(), process.env.JOBGUARD_ENV), "quote", request));
}
