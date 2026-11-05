import type { Pool } from "pg";
import { z } from "zod";
import { PurchaseOrderActionRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

const scope = z.object({ version: z.literal("merchant-order-screen.v1"), revisionId: z.uuid() });
export const merchantOrderRequest = z.discriminatedUnion("kind", [
  scope.extend({ kind: z.literal("preview") }).strict(),
  scope.extend({ kind: z.literal("approve"), commandId: z.uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    recipient: z.string().min(1).max(320), amountPence: z.number().int().nonnegative(), revision: z.number().int().positive(), expiresAt: z.iso.datetime() }).strict(),
  scope.extend({ kind: z.literal("manual"), commandId: z.uuid(), supplierReference: z.string().regex(/^synthetic-[a-zA-Z0-9-]{1,80}$/u) }).strict(),
]);
export type MerchantOrderPreview = Awaited<ReturnType<PurchaseOrderActionRepository["preview"]>> & { approvalExpiresAt: string };

/** Request-scoped practice bridge. Neither actor nor tenant is accepted in a DTO. */
export class MerchantOrderApplication {
  private readonly access: PracticeAccess;
  constructor(pool: Pool, sessionId?: string,
    private readonly repository: Pick<PurchaseOrderActionRepository, "preview" | "approve" | "attestManual"> = new PurchaseOrderActionRepository(pool)) {
    this.access = new PracticeAccess(pool, sessionId);
  }
  async execute(jobId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error("Practice only"), { code: "SYNTHETIC_MODE_REQUIRED" });
    // Authorize the job before reading any order, including on malformed/wrong-job requests.
    const auth = await this.access.job(jobId);
    const input = merchantOrderRequest.parse(raw);
    const orderScope = { version: "merchant-order-scope.v1", jobId, revisionId: input.revisionId };
    if (input.kind === "preview") return { ...await this.repository.preview(auth.context, orderScope), approvalExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
    if (input.kind === "manual") return this.repository.attestManual(auth.context, {
      version: "manual-order-attestation.v1", jobId, revisionId: input.revisionId,
      commandId: input.commandId, supplierReference: input.supplierReference,
    }, auth.membershipId);
    if (Date.parse(input.expiresAt) > Date.now() + 10 * 60_000) throw new Error("ORDER_ACTION_INVALID");
    // Do not replace reviewed facts with a fresh preview: changes must invalidate authority.
    return this.repository.approve(auth.context, orderScope, {
      version: "command.v1", commandId: input.commandId, authorizationId: input.commandId,
      commandType: "purchase_order.send.dark", semanticKey: `merchant-order:${jobId}:${input.revisionId}`,
      actorMembershipId: auth.membershipId, subjectType: "purchase_order", subjectRef: input.revisionId,
      action: { actionType: "purchase_order.send.dark", recipient: input.recipient, contentHash: input.contentHash,
        aggregateRevision: input.revision, amountPence: input.amountPence, currency: "GBP",
        policyVersion: "dark-merchant-order.v1", expiresAt: input.expiresAt },
    });
  }
}
