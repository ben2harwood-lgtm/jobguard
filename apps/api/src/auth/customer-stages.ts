import { z } from "zod";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerRefused, CustomerSigninApplication, customerToken, customerRefusal } from "./customer-signin.js";
const uuid = z.guid().transform(v => v.toLowerCase());
export const customerStagesRead = z.object({ version: z.literal("customer-stages-read.v1"), jobId: uuid }).strict();
export const customerStageAcknowledge = z.object({ version: z.literal("customer-stage-acknowledge.v1"), jobId: uuid, commandId: uuid, completionId: uuid, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export type CustomerStageAction = "stages" | "stage-acknowledge";
export class CustomerStagesApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  async run(action: CustomerStageAction, raw: unknown, request: IdentityHttpRequest) {
    try {
      const input = action === "stages" ? customerStagesRead.parse(raw) : customerStageAcknowledge.parse(raw);
      await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: input.jobId }, request);
      const token = customerToken(request)!;
      const [tenant, job, customer] = token.split(".");
      const result = await this.identity.provider.repository.pool.query<{result: unknown}>(
        "SELECT identity.customer_stages($1,$2,$3,$4,$5,$6,$7) result",
        [tenant, job, customer, this.identity.provider.digest(`customer-session:${token}`), "completionId" in input ? input.completionId : null, "commandId" in input ? input.commandId : null, "snapshotHash" in input ? input.snapshotHash : null]);
      return result.rows[0]!.result;
    } catch (error) {
      if (error instanceof z.ZodError || (error as {code?: string})?.code === "42501") throw new CustomerRefused();
      throw error;
    }
  }
}
export async function customerStagesHttp(application: () => CustomerStagesApplication, action: CustomerStageAction, request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().run(action, await request.json(), {headers: Object.fromEntries(request.headers.entries())}), {headers}); }
  catch (error) { const failure = customerRefusal(error); return Response.json(failure.body, {status: failure.status, headers}); }
}
