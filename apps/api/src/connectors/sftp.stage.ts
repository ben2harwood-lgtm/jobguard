import { z } from "zod";
import { billingStatusV1 } from "@jobguard/core";
import { connectorInputV1, ConnectorInputError, type ConnectorIntake, type ConnectorReceipt } from "./inbound.js";
import type { parseBillingImportEnvelope } from "../contractor/billing.contracts.js";
import type { createInMemorySftpServer } from "./sftp.synthetic.js";

type Client = ReturnType<ReturnType<typeof createInMemorySftpServer>["connect"]>;
type Pull = Awaited<ReturnType<Client["pull"]>>;
const label = z.string().max(120).regex(/^fixture:[a-z0-9_-]+$(?![\s\S])/u);
const descriptorV1 = z.object({ version: z.literal("sftp-stage-descriptor.v1"), subject: label,
  revision: z.number().int().min(1).max(2_147_483_647), document: label }).strict();

/** Internal synthetic seam: pass a result of the scope-checked fake client's pull, never
 * a request body. The separate harness-selected binding fixes tenant and namespace in SQL.
 * Only fixture references/status cross into intake, never the parsed domain payload.
 */
export async function stageSftpFixturePull(pull: Pull, descriptor: unknown,
  binding: Readonly<{ bindingId: string; databaseToken: string }>, intake: ConnectorIntake): Promise<ConnectorReceipt> {
  try {
    const d = descriptorV1.parse(descriptor);
    if (pull.version !== "sftp-fixture-pull.v1") throw new ConnectorInputError();
    const base = { version: "connector-input.v1", eventId: pull.eventId, subject: d.subject, revision: d.revision };
    let input;
    if (pull.operation === "billing_status") {
      const envelope = pull.payload as ReturnType<typeof parseBillingImportEnvelope>;
      if (envelope.observations.length !== 1) throw new ConnectorInputError();
      const event = billingStatusV1.parse(envelope.observations[0]!.event);
      const status = event.factType === "invoiced" ? "billed" : event.factType === "paid" ? "paid"
        : event.factType === "payment_reversed" ? "reversed" : undefined;
      if (!status) throw new ConnectorInputError();
      input = connectorInputV1.parse({ ...base, kind: "billing_status", status });
    } else {
      if (pull.operation !== "work_orders" && pull.operation !== "materials_issues") throw new ConnectorInputError();
      input = connectorInputV1.parse({ ...base, kind: pull.operation === "work_orders" ? "work_order" : "materials_issue", document: d.document });
    }
    return await intake.stage(binding.bindingId, binding.databaseToken, input);
  } catch { throw new ConnectorInputError(); }
}
