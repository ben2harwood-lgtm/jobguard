import { customerQuoteAcceptanceV1, customerQuoteReadV1 } from "@jobguard/core";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerSigninApplication, CustomerRefused, customerToken, customerRefusal } from "./customer-signin.js";
export const CUSTOMER_QUOTE_APPLICATION = "CUSTOMER_QUOTE_APPLICATION";
export const customerQuoteActions = ["quote", "quote-accept"] as const;
export type CustomerQuoteAction = typeof customerQuoteActions[number];
export class CustomerQuoteApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  async run(action: CustomerQuoteAction, raw: unknown, request: IdentityHttpRequest): Promise<unknown> {
    const parsed = (action === "quote" ? customerQuoteReadV1 : customerQuoteAcceptanceV1).safeParse(raw);
    if (!parsed.success) throw new CustomerRefused();
    // Reuse the session boundary unchanged, including same-origin and customer/job checks.
    await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: parsed.data.jobId }, request);
    const token = customerToken(request)!;
    const [tenant, job, customer] = token.split(".");
    try {
      return (await this.identity.provider.repository.pool.query<{ result: unknown }>(
        "SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb) result",
        [tenant, job, customer, this.identity.provider.digest(`customer-session:${token}`), JSON.stringify(parsed.data)],
      )).rows[0]!.result;
    } catch (error) { if ((error as { code?: string })?.code === "42501") throw new CustomerRefused(); throw error; }
  }
}
export async function customerQuoteHttp(application: () => CustomerQuoteApplication, action: CustomerQuoteAction, request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().run(action, await request.json(), { headers: Object.fromEntries(request.headers.entries()) }), { headers }); }
  catch (error) { const failure = customerRefusal(error); return Response.json(failure.body, { status: failure.status, headers }); }
}
