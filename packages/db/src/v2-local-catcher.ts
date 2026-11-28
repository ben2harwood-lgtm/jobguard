// V2 uses invented destinations. Existing simulated providers still produce their
// usual local receipts. Capture metadata only, never message bodies or sign-in codes.
const destinations = new Set([
  "builder@jobguard-v2.invalid",
  "second-builder@jobguard-v2.invalid",
  "customer@jobguard-v2.invalid",
  "merchant@jobguard-v2.invalid",
  "tiler@jobguard-v2.invalid",
  "decorator@jobguard-v2.invalid",
  // The party form's default invented address (Q84 B1); the .invalid domain can never resolve.
  "practice-customer@example.invalid",
  "+447700900042",
]);

export function assertV2Recipient(recipient: string | null) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || recipient === null) return;
  let recipients: unknown = [recipient];
  if (recipient.startsWith("[")) {
    try { recipients = JSON.parse(recipient) as unknown; }
    catch { throw new Error("V2_RECIPIENT_BLOCKED"); }
  }
  if (!Array.isArray(recipients) || recipients.length === 0 ||
      !recipients.every(value => typeof value === "string" && destinations.has(value))) {
    throw new Error("V2_RECIPIENT_BLOCKED");
  }
}

export function captureV2Delivery(kind: string, recipient: string | null) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return;
  assertV2Recipient(recipient);
  console.info(JSON.stringify({ event: "v2.delivery.captured", kind }));
}
