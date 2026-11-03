import { CustomerQuoteApplication, customerQuoteHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
export async function POST(request: Request) {
  return customerQuoteHttp(() => new CustomerQuoteApplication(identityApplication(), process.env.JOBGUARD_ENV), "quote-accept", request);
}
