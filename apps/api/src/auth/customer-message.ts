import { z } from "zod";
import { jobSourceTextV1, customerMessageV1 } from "@jobguard/core";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerSigninApplication, CustomerRefused, customerRefusal, customerToken } from "./customer-signin.js";

export const customerPortalMessageV1 = z.object({
  version: z.literal("customer-portal-message.v1"), jobId: z.guid(), commandId: z.guid(), text: jobSourceTextV1,
}).strict();
// Customer output shares the checked message fields, excluding the builder's internal sponsor.
const customerPortalMessageReceiptV1 = z.object({
  version: z.literal("job-source-intake-receipt.v1"), jobId: z.guid(),
  sourceKind: z.literal("customer_message"), environment: z.literal("synthetic_demo"),
  realExternalActions: z.literal(0), record: customerMessageV1.unwrap().omit({actualTesterMembershipId: true}).readonly(),
}).strict();
/** Uses sign-in's persisted session; never constructs a membership or a tenant context. */
export class CustomerMessageApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  async post(raw: unknown, request: IdentityHttpRequest) {
    const parsed = customerPortalMessageV1.safeParse(raw);
    if (!parsed.success) throw new CustomerRefused();
    const input = parsed.data;
    await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: input.jobId }, request);
    const token = customerToken(request)!;
    // The existing sign-in boundary has checked the exact credential tuple and bound job.
    const [tenantId, jobId, customerId] = token.split(".");
    const digest = this.identity.provider.digest(`customer-session:${token}`);
    try {
      const result = (await this.identity.provider.repository.pool.query<{result: unknown}>(
        "SELECT identity.customer_portal_message($1,$2,$3,$4,$5::jsonb) result",
        [tenantId, jobId, customerId, digest, JSON.stringify(input)],
      )).rows[0]?.result;
      const receipt = customerPortalMessageReceiptV1.parse(result);
      if (receipt.sourceKind !== "customer_message" || receipt.jobId !== jobId) throw new Error("Invalid message receipt");
      return receipt;
    } catch (error) {
      if ((error as {code?: string})?.code === "42501") throw new CustomerRefused();
      throw error;
    }
  }
}
export function customerMessageFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "POST_LOCK_WORK_REQUIRES_LINKED_JOB") return {status: 422, body: {code, message: "Start a linked job for this customer and site", environment: "synthetic_demo", realExternalActions: 0}};
  if (code === "IDEMPOTENCY_CONFLICT" || code === "JOB_NOT_LIVE") return {status: 409, body: {code}};
  return customerRefusal(error);
}
export async function customerMessageHttp(application: () => CustomerMessageApplication, request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().post(await request.json(), {headers: Object.fromEntries(request.headers.entries())}), {status: 201, headers}); }
  catch (error) { const failure = customerMessageFailure(error); return Response.json(failure.body, {status: failure.status, headers}); }
}
