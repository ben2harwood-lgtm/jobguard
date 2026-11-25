import { customerVariationApprovalCommandV1, customerVariationPhotoReadV1, customerVariationReadV1 } from "@jobguard/core";
import { z } from "zod";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerSigninApplication, CustomerRefused, customerRefusal, customerToken } from "./customer-signin.js";
class CustomerVariationLocked extends Error {}
class CustomerVariationPhotosChanged extends Error {}
export function customerVariationFailure(error: unknown) {
  if (error instanceof CustomerVariationPhotosChanged) return { status: 409, body: {
    code: "PHOTOS_CHANGED", message: "The photos on this extra have changed. Reload it before approving.",
  } };
  if (error instanceof CustomerVariationLocked) return { status: 409, body: {
    code: "VARIATION_LOCKED_BY_FINAL_ACCOUNT", message: "This extra cannot be approved because the final account is complete.",
  } };
  return customerRefusal(error);
}
export const CUSTOMER_VARIATION_APPLICATION = "CUSTOMER_VARIATION_APPLICATION";
export const customerVariationActions = ["variations/read", "variation-approvals", "variation-photo"] as const;
/** Signs a short-lived download for one exact stored photo version. Absent where no evidence store is configured. */
export type CustomerVariationPhotoSigner = (object: { key: string; versionId: string }) => Promise<string>;
export type CustomerVariationAction = typeof customerVariationActions[number];
/** Reuses the sign-in session boundary; SQL resolves it again under the commercial locks. */
export class CustomerVariationApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined,
    private readonly signPhoto?: CustomerVariationPhotoSigner) {}
  async run(action: CustomerVariationAction, raw: unknown, request: IdentityHttpRequest): Promise<unknown> {
    try {
      const input = action === "variations/read" ? customerVariationReadV1.parse(raw)
        : action === "variation-photo" ? customerVariationPhotoReadV1.parse(raw) : customerVariationApprovalCommandV1.parse(raw);
      if (action === "variation-photo" && !this.signPhoto) throw new CustomerRefused();
      await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: input.jobId }, request);
      // The sign-in boundary has validated this exact cookie and its current server-side scope.
      const token = customerToken(request, this.environment)!;
      const [tenantId, jobId, customerId] = token.split(".");
      if (action === "variation-photo") {
        const target = (await this.identity.provider.repository.pool.query<{ result: { objectKey: string; objectVersionId: string } }>(
          "SELECT identity.customer_variation_photo($1,$2,$3,$4,$5) result",
          [tenantId, jobId, customerId, this.identity.provider.digest(`customer-session:${token}`), (input as { evidenceId: string }).evidenceId],
        )).rows[0]!.result;
        return { version: "customer-variation-photo-url.v1", downloadUrl: await this.signPhoto!({ key: target.objectKey, versionId: target.objectVersionId }), expiresInSeconds: 60 };
      }
      return (await this.identity.provider.repository.pool.query<{ result: unknown }>(
        "SELECT identity.customer_variation($1,$2,$3,$4,$5::jsonb) result",
        [tenantId, jobId, customerId, this.identity.provider.digest(`customer-session:${token}`), action === "variations/read" ? null : JSON.stringify(input)],
      )).rows[0]!.result;
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };
      if (databaseError?.code === "42501" && databaseError.message === "VARIATION_LOCKED_BY_FINAL_ACCOUNT") throw new CustomerVariationLocked();
      if (databaseError?.code === "42501" && databaseError.message === "PHOTOS_CHANGED") throw new CustomerVariationPhotosChanged();
      if (error instanceof z.ZodError || (error as { code?: string })?.code === "42501") throw new CustomerRefused();
      throw error;
    }
  }
}
export async function customerVariationHttp(application: () => CustomerVariationApplication, action: CustomerVariationAction, request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().run(action, await request.json(), { headers: Object.fromEntries(request.headers.entries()) }), { headers }); }
  catch (error) { const failure = customerVariationFailure(error); return Response.json(failure.body, { status: failure.status, headers }); }
}
