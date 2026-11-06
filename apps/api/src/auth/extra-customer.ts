import { deriveVisitApprovalTiming, type VisitTimingSource, type TimingRequest, type ApprovalTimingFact, type OperativeWorkStatus } from "@jobguard/db";
import { z } from "zod";
import type { IdentityApplication } from "./identity.application.js";
import type { IdentityHttpRequest } from "./identity-http.js";
import { CustomerSigninApplication, CustomerRefused, customerRefusal, customerToken } from "./customer-signin.js";
const uuid = z.guid().transform(value => value.toLowerCase());
const common = { version: z.literal("extra-customer.v1"), jobId: uuid };
export const extraCustomerInput = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.enum(["queue", "history"]) }).strict(),
  z.object({ ...common, action: z.literal("view"), requestId: uuid }).strict(),
  z.object({ ...common, action: z.literal("decide"), requestId: uuid, commandId: uuid,
    revisionHash: z.string().regex(/^[a-f0-9]{64}$/u), netPence: z.number().int().min(1).max(1_000_000_000_000), decision: z.enum(["approve", "reject"]) }).strict(),
]);
export class ExtraCustomerApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  async run(raw: unknown, request: IdentityHttpRequest): Promise<unknown> {
    try {
      const input = extraCustomerInput.parse(raw);
      await new CustomerSigninApplication(this.identity, this.environment).run("read", { version: "customer-read.v1", jobId: input.jobId }, request);
      const token = customerToken(request)!;
      const [tenant, job, client] = token.split(".");
      const result = (await this.identity.provider.repository.pool.query<{ result: unknown }>(
        "SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",
        [tenant, job, client, this.identity.provider.digest(`customer-session:${token}`), JSON.stringify(input)],
      )).rows[0]!.result;
      const project = (raw: unknown) => {
        const item = raw as { requestId: string; timingInputs?: { visit: VisitTimingSource | null; requests: TimingRequest[]; facts: ApprovalTimingFact[]; workStatus: OperativeWorkStatus | null } };
        if (!item.timingInputs) return item;
        const { timingInputs: timing, ...rest } = item;
        return { ...rest, ...deriveVisitApprovalTiming(timing.visit ?? undefined, timing.requests, timing.facts, item.requestId, timing.workStatus ?? undefined) };
      };
      if (input.action === "queue") return { items: (result as { items: unknown[] }).items.map(project) };
      return input.action === "view" ? project(result) : result;
    } catch (error) {
      if (error instanceof z.ZodError || (error as { code?: string })?.code === "42501") throw new CustomerRefused();
      throw error;
    }
  }
}
export async function extraCustomerHttp(application: () => ExtraCustomerApplication, request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try { return Response.json(await application().run(await request.json(), { headers: Object.fromEntries(request.headers.entries()) }), { headers }); }
  catch (error) {
    const message = (error as Error)?.message;
    if (["STALE_REVISION", "HASH_MISMATCH", "ALREADY_DECIDED", "LINK_REPLAYED", "LINK_EXPIRED", "LINK_REVOKED", "COMMAND_CONFLICT"].includes(message)) {
      return Response.json({ code: message }, { status: 409, headers });
    }
    const failure = customerRefusal(error);
    return Response.json(failure.body, { status: failure.status, headers });
  }
}
