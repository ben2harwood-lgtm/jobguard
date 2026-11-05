import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export class SubscriptionWebhookVerificationError extends Error {
  readonly code = "SUBSCRIPTION_WEBHOOK_REFUSED";
  constructor() { super("SUBSCRIPTION_WEBHOOK_REFUSED"); this.name = "SubscriptionWebhookVerificationError"; }
}

const headerV1 = z.string().min(1).max(8192);
const secretV1 = z.string().refine(value => value.trim().length > 0);
const timestampV1 = z.string().regex(/^(0|[1-9][0-9]*)$/u).transform(Number).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
const digestV1 = z.string().regex(/^[a-fA-F0-9]{64}$/u);

/** Local v1 protocol candidate, NOT provider-sandbox verified. No parsing or business effects.
 * HMAC-SHA256 over ASCII "<unix seconds>." followed by the exact raw body bytes.
 * Clock returns Unix milliseconds. Accepts timestamps within 300 seconds in either direction.
 */
export function verifySubscriptionWebhookV1(
  rawBody: Uint8Array, signatureHeader: unknown, secret: unknown, clock: () => number,
): void {
  const refuse = () => { throw new SubscriptionWebhookVerificationError(); };
  if (!secretV1.safeParse(secret).success || !headerV1.safeParse(signatureHeader).success || !(rawBody instanceof Uint8Array)) refuse();
  const parts = (signatureHeader as string).split(",").map(part => part.trim());
  const timestamps = parts.filter(part => part.startsWith("t="));
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  if (timestamps.length !== 1 || signatures.length === 0 || signatures.some(value => !digestV1.safeParse(value).success)) refuse();
  const timestamp = timestampV1.safeParse(timestamps[0]!.slice(2));
  const now = clock();
  if (!timestamp.success || !Number.isFinite(now) || Math.abs(now / 1000 - timestamp.data) > 300) refuse();
  const expected = createHmac("sha256", secret as string).update(`${timestamp.data}.`).update(rawBody).digest();
  // Check every v1 candidate: rotation can supply several signatures, in either order.
  let matched = false;
  for (const value of signatures) matched = timingSafeEqual(expected, Buffer.from(value, "hex")) || matched;
  if (!matched) refuse();
}
