import { customerVariationApprovalCommandV1, customerVariationReadV1 } from "@jobguard/core";
import { z } from "zod";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerSigninApplication, CustomerRefused, customerRefusal, customerToken } from "./customer-signin.js";
export const CUSTOMER_VARIATION_APPLICATION = "CUSTOMER_VARIATION_APPLICATION";
export const customerVariationActions = ["variations/read", "variation-approvals"] as const;
export type CustomerVariationAction = typeof customerVariationActions[number];
/** Reuses the sign-in session boundary; SQL resolves it again under the commercial locks. */
export class CustomerVariationApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  async run(action: CustomerVariationAction, raw: unknown, request: IdentityHttpRequest): Promise<unknown> {
    try {
      const input = action === "variations/read" ? customerVariationReadV1.parse(raw) : customerVariationApprovalCommandV1.parse(raw);
      await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: input.jobId }, request);
      // The sign-in boundary has validated this exact cookie and its current server-side scope.
      const token = customerToken(request)!;
      const [tenantId, jobId, customerId] = token.split(".");
      return (await this.identity.provider.repository.pool.query<{ result: unknown }>(
        "SELECT identity.customer_variation($1,$2,$3,$4,$5::jsonb) result",
        [tenantId, jobId, customerId, this.identity.provider.digest(`customer-session:${token}`), action === "variations/read" ? null : JSON.stringify(input)],
      )).rows[0]!.result;
    } catch (error) {
      if (error instanceof z.ZodError || (error as { code?: string })?.code === "42501") throw new CustomerRefused();
      throw error;
    }
  }
}
export async function customerVariationHttp(application: () => CustomerVariationApplication, action: CustomerVariationAction, request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().run(action, await request.json(), { headers: Object.fromEntries(request.headers.entries()) }), { headers }); }
  catch (error) { const failure = customerRefusal(error); return Response.json(failure.body, { status: failure.status, headers }); }
}
