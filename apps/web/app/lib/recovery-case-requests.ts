import { z } from "zod";
import { recoveryCaseCommandResponseV1, recoveryCaseListResponseV1, type RecoveryCaseCommandResponse, type RecoveryCaseResponse } from "@jobguard/api/recovery-case-contracts";

/**
 * How the recovery workbench reads what the network gives it (M4-1-S-R repair 13).
 *
 * Nothing from the network is trusted to have the shape the screen needs. Three things are decided here, once, so the component cannot decide them differently in different places:
 *
 *  1. Whether the answer to a command is a SAVE, a REFUSAL or UNKNOWN (Sol P2-2). Only a confirmed outcome ends an attempt; an unknown one must be re-sent with the same command id.
 *  2. Whether an answer is a valid command answer at all: it must name the case the command affected, and that case must be in the list that comes with it (Sol P3-4).
 *  3. Whether every row of each recorded-source lookup has the fields the workbench reads from it (Sol P3-3), before a single row is used to build a command.
 */

export const saveFailure = "Recovery case could not be saved";
const resend = "Choose Try again to send the same request again; the server recognises a repeat and will not apply it twice.";
export const lostAnswer = `The connection was lost before the server's answer arrived. Your last action may or may not have been saved. ${resend}`;
export const unreadableAnswer = `The answer from the server could not be read. Your last action may or may not have been saved. ${resend}`;
export const supplierLookupFailure = "Recorded supplier sources could not be loaded";
export const customerLookupFailure = "Recorded customer invoices could not be loaded";

/** What came back from a command: the HTTP status and the body as far as it could be read, or nothing at all when no answer arrived. */
export type CommandAnswer = Readonly<{ status: number; body: unknown }> | undefined;

export type CommandOutcome =
  /** The server saved it and said so in the shape the contract promises. */
  | Readonly<{ kind: "saved"; response: RecoveryCaseCommandResponse }>
  /** The server examined the request and declined it: nothing was saved, so the attempt is over. */
  | Readonly<{ kind: "refused"; message: string }>
  /** The answer was lost or cannot be used: the command may or may not have been saved, so the attempt is NOT over. */
  | Readonly<{ kind: "unknown"; message: string }>;

/** A refusal's text, from whatever body came back; a body that is missing or not an object still gets a plain sentence, never a JavaScript error message. */
export const refusalText = (body: unknown): string => {
  const text = typeof body === "object" && body !== null ? body as { message?: unknown; code?: unknown } : {};
  return typeof text.message === "string" && text.message ? text.message : typeof text.code === "string" && text.code ? text.code : saveFailure;
};

/**
 * Decide what an answer means.
 *
 * A first-attempt 4xx is an explicit refusal. On retry it may precede the original-command lookup and leave that earlier outcome UNKNOWN. Anything else that is not a valid success is UNKNOWN, including a 5xx (a command can
 * commit and then fail while its answer is being built, or a gateway can answer for a server that did the work) and a 2xx that does not match the command contract.
 */
export function commandOutcome(answer: CommandAnswer, earlierOutcomeUnknown = false): CommandOutcome {
  if (answer === undefined) return { kind: "unknown", message: lostAnswer };
  const { status, body } = answer;
  if (status >= 200 && status < 300) {
    const parsed = recoveryCaseCommandResponseV1.safeParse(body);
    return parsed.success ? { kind: "saved", response: parsed.data } : { kind: "unknown", message: unreadableAnswer };
  }
  if (status >= 400 && status < 500) {
    // Membership/session/job checks can refuse a retry BEFORE the durable command is looked up.
    // Such a refusal says nothing about the earlier request. Only a payload conflict explicitly
    // establishes, through that lookup, that this exact command body was not the recorded work.
    const payloadConflict = status === 409 && typeof body === "object" && body !== null
      && "code" in body && body.code === "IDEMPOTENCY_PAYLOAD_CONFLICT";
    if (earlierOutcomeUnknown && !payloadConflict) return { kind: "unknown", message: `${refusalText(body)}. Your earlier action may or may not have been saved. ${resend}` };
    return { kind: "refused", message: refusalText(body) };
  }
  return { kind: "unknown", message: unreadableAnswer };
}

/** A plain read of the register: the versioned list contract, or nothing. */
export const readList = (body: unknown): RecoveryCaseResponse | undefined => {
  const parsed = recoveryCaseListResponseV1.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

// Recorded sources are identified by id. A row without a usable id could only ever become a command naming nothing.
const recordedId = z.string().uuid();
// A material row's rate is absent when no agreed price applies (null from the database), and its per-unit price only exists once a rate applies.
const materialRow = z.object({ quantity: z.string(), rateId: recordedId.nullish(), eachPence: z.number().int().optional() });
const supplierFactRow = z.object({ document_number: z.string().nullable(), version_id: recordedId });
const customerInvoiceRow = z.object({ id: recordedId });
const materialsAnswer = z.object({ materials: z.array(materialRow) });
const supplierDocumentsAnswer = z.object({ state: z.object({ facts: z.array(supplierFactRow) }) });
const customerInvoicesAnswer = z.object({ invoices: z.array(customerInvoiceRow) });

export type SupplierSources = Readonly<{ materials: z.infer<typeof materialRow>[]; facts: z.infer<typeof supplierFactRow>[] }>;

/** Both supplier lookups, every row checked, or nothing. */
export function parseSupplierSources(materialsBody: unknown, documentsBody: unknown): SupplierSources | undefined {
  const materials = materialsAnswer.safeParse(materialsBody), documents = supplierDocumentsAnswer.safeParse(documentsBody);
  return materials.success && documents.success ? { materials: materials.data.materials, facts: documents.data.state.facts } : undefined;
}

/** The customer-invoice lookup, every row checked, or nothing. */
export function parseCustomerInvoices(body: unknown): z.infer<typeof customerInvoiceRow>[] | undefined {
  const parsed = customerInvoicesAnswer.safeParse(body);
  return parsed.success ? parsed.data.invoices : undefined;
}

// The fixed fictional labels used when no recorded source matches. They identify nothing recorded, and a case that holds them cannot have an evidence pack built.
const practiceMerchantSources = ["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"];
const practiceCustomerSources = ["Generated customer invoice INV-18800"];

/**
 * The sources for the materials-320 practice claim.
 *
 * Fixture-specific: this practice button selects the supplied materials-320 fictional rate (40 each at £20.00) and its fictional invoice INV-M320-001. It is a picker for the
 * generated fixture, not a rule for real supplier records. The selectable materials-B delivery is a different fixture and must never be attached to this case.
 */
export function merchantSourceRefs(sources: SupplierSources): string[] {
  const rates = sources.materials.filter(item => item.quantity === "40" && item.eachPence === 2000 && item.rateId);
  const invoice = sources.facts.filter(item => item.document_number === "INV-M320-001").at(-1);
  return invoice && rates.length === 1 ? [rates[0]!.rateId!, invoice.version_id] : practiceMerchantSources;
}

/** The sources for a customer claim or a prevention: the newest recorded customer invoice, else the fixed practice label. */
export function customerSourceRefs(invoices: readonly { id: string }[]): string[] {
  const invoice = invoices.at(-1);
  return invoice ? [invoice.id] : practiceCustomerSources;
}
