import { CustomerStagesApplication, customerStagesHttp } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
export async function POST(request: Request) {
  return customerStagesHttp(() => new CustomerStagesApplication(identityApplication(), process.env.JOBGUARD_ENV), "stages", request);
}
