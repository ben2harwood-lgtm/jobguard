import { mobileAccessV1, mobilePartitionV1 } from "@jobguard/core";
import { z } from "zod";
import type { NativeDownloadTransport } from "./download";
import { MobileClientError, samePartition, type Partition } from "./lifecycle-contracts";

const version = z.literal("native-download-reply.v1");
const replyV1 = z.discriminatedUnion("outcome", [
 z.object({ version, outcome: z.literal("denied") }).strict(),
 z.object({ version, outcome: z.literal("current"), partition: mobilePartitionV1 }).strict(),
 z.object({ version, outcome: z.literal("ok"), value: z.unknown() }).strict(),
]);

/** The owner supplies the existing mobile access credential at send time and binds the source
 * session to its channel. This adapter keeps no copy of either credential. */
export class NativeDownloadConnection implements NativeDownloadTransport {
 constructor(
  private readonly partition: Partition,
  private readonly access: () => Promise<z.infer<typeof mobileAccessV1>>,
  private readonly send: (message: unknown) => Promise<unknown>,
 ) {}

 private async sendOperation(operation: { kind: "check" } | { kind: "subscribe" | "page"; request: unknown }) {
  const access = mobileAccessV1.safeParse(await this.access());
  if (!access.success) throw new MobileClientError("MOBILE_DENIED");
  // Failed delivery is retryable. An authenticated denial is a separate reply.
  const reply = await this.send({
   version: "native-download-call.v1", deviceInstanceId: this.partition.deviceInstanceId,
   access: access.data, operation,
  }).then(raw => replyV1.parse(raw)).catch(() => { throw new MobileClientError("MOBILE_RECOVERY_REQUIRED"); });
  if (reply.outcome === "denied") throw new MobileClientError("MOBILE_DENIED");
  return reply;
 }

 async assertCurrent(partition: Partition) {
  if (!samePartition(this.partition, partition)) throw new MobileClientError("MOBILE_DENIED");
  const reply = await this.sendOperation({ kind: "check" });
  if (!("partition" in reply) || !samePartition(reply.partition, partition)) throw new MobileClientError("MOBILE_DENIED");
 }

 async subscribe(request: unknown, partition: Partition) {
  if (!samePartition(this.partition, partition)) throw new MobileClientError("MOBILE_DENIED");
  const reply = await this.sendOperation({ kind: "subscribe", request });
  if (!("value" in reply)) throw new MobileClientError("MOBILE_DENIED");
  return reply.value;
 }

 async page(request: unknown) {
  const reply = await this.sendOperation({ kind: "page", request });
  if (!("value" in reply)) throw new MobileClientError("MOBILE_DENIED");
  return reply.value;
 }
}
