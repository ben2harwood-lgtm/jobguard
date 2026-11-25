import { pilotEvidenceStorage } from "@jobguard/db";
import { CustomerVariationApplication, customerVariationHttp } from "@jobguard/api/identity";
import { customerPortalRequest } from "../../../lib/customer-portal-server";
/** QW-1: a 60-second download for one photo on the customer's own extra. Pilot evidence store only. */
export async function POST(request: Request) {
  const signer = process.env.JOBGUARD_ENV === "pilot_no_charge"
    ? (object: { key: string; versionId: string }) => pilotEvidenceStorage().createDownloadUrl({ ...object, expiresInSeconds: 60 })
    : undefined;
  return customerPortalRequest(request, identityApplication => customerVariationHttp(() => new CustomerVariationApplication(identityApplication(), process.env.JOBGUARD_ENV, signer), "variation-photo", request));
}
