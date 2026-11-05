import { z } from "zod";
import { NextResponse } from "next/server";
import { subscriptionAgreementSelectionV1 } from "@jobguard/core";
import { subscriptionMandateRequest } from "../../lib/subscription-mandate-server";

export const dynamic = "force-dynamic";
const { tenantId: _tenantId, ...selectionShape } = subscriptionAgreementSelectionV1.shape;
const common = { version: z.literal("subscription-mandate-command.v1"), expectedSequence: z.number().int().safe().nonnegative() };
/** Deliberately narrower than the internal worker command schema. No caller identity or settings. */
const browserMandateCommandV1 = z.object({
  commandId: z.string().uuid(),
  command: z.discriminatedUnion("kind", [
    z.object({ ...common, kind: z.literal("approve"), selection: z.object(selectionShape).strict(),
      previewProof: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
    z.object({ ...common, kind: z.enum(["revoked", "cancelled"]) }).strict(),
  ]),
}).strict();
export type BrowserMandateCommand = z.infer<typeof browserMandateCommandV1>;
export async function GET(request: Request) { return subscriptionMandateRequest(request); }
export async function POST(request: Request) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "NOT_FOUND" },
    { status: 404, headers: { "Cache-Control": "no-store" } });
  const parsed = browserMandateCommandV1.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ version: "subscription-mandate-error.v1", code: "MANDATE_INVALID" },
    { status: 400, headers: { "Cache-Control": "no-store" } });
  return subscriptionMandateRequest(request, parsed.data);
}
