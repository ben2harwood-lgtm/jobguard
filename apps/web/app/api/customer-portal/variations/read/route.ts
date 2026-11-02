import { CustomerVariationApplication, customerVariationHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../../lib/identity-server";
export async function POST(request: Request) {
  return customerVariationHttp(() => new CustomerVariationApplication(identityApplication(), process.env.JOBGUARD_ENV), "variations/read", request);
}
