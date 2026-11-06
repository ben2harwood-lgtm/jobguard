import { ExtraCustomerApplication, extraCustomerHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
/** Customer credentials, never the practice owner's role switch, authorize this endpoint. */
export async function POST(request: Request) {
  return extraCustomerHttp(() => new ExtraCustomerApplication(identityApplication(), process.env.JOBGUARD_ENV), request);
}
