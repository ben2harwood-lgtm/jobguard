import { z } from "zod";

const uuid = z.guid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().positive();

// Validate the existing acceptance GET/POST projection before using it to end
// an uncertain write. This is a client reader, not a new server contract.
export const quoteAcceptanceReadV1 = z.object({
  version: z.literal(1), environment: z.literal("synthetic_demo"), jobId: uuid,
  jobStatus: z.string(), jobRevision: z.number().int().nonnegative(),
  currentDocument: z.object({ id: uuid, version, hash, netPence: pence, totalPence: pence }).nullable(),
  activeAcceptance: z.object({
    id: uuid, documentId: uuid, documentVersion: version, documentHash: hash,
    netPence: pence, totalPence: pence, actor: z.string(), acceptedAt: z.iso.datetime(),
    method: z.enum(["verbal", "email", "message", "signed-paper", "customer_portal"]),
    statedCustomerName: z.string(), sourceEvidence: z.string(),
  }).nullable(),
  events: z.array(z.object({
    id: uuid, kind: z.enum(["accepted", "acceptance_cancelled", "declined", "superseded"]),
    documentVersion: version, documentHash: hash, occurredAt: z.iso.datetime(), actor: z.string(),
  })),
  effects: z.object({ platformObligations: z.literal(0), settlements: z.literal(0), recoveryFees: z.literal(0) }),
});

export type QuoteAcceptanceRead = z.infer<typeof quoteAcceptanceReadV1>;
export type PendingAcceptance = {
  body: string;
  command: {
    version: "quote-acceptance-command.v1"; commandId: string; documentId: string;
    documentHash: string; documentVersion: number; statedCustomerName: string;
    statedMethod: string; acceptedAt: string;
  };
};

export function confirmsAcceptance(view: QuoteAcceptanceRead, pending: PendingAcceptance): boolean {
  const saved = view.activeAcceptance, command = pending.command;
  return saved !== null && saved.documentId === command.documentId
    && saved.documentHash === command.documentHash && saved.documentVersion === command.documentVersion
    && saved.statedCustomerName === command.statedCustomerName.trim() && saved.method === command.statedMethod
    && saved.acceptedAt === command.acceptedAt;
}
