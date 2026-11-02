import { z } from "zod";

const uuid = z.string().uuid();
export const core1000Source = `JOB: Fictional practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00`;
export const core1000Link = (id: string) => `/demo-s/core-1000?${new URLSearchParams({ jobId: uuid.parse(id) })}`;

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const id = z.object({ id: uuid });
const proposal = z.object({ review: z.object({ lines: z.array(z.object({ disposition: z.string() })) }).nullable() });
const quotes = z.object({ revisions: z.array(id.extend({ revision: z.number(), netPence: z.number() })) });
const activation = z.object({ activation: id.extend({ recoveryCapPence: z.number().nullable(), policyVersion: z.string() }).nullable(),
  terms: z.object({ acceptedNetPence: z.number() }).nullable() });
const variations = z.object({ approvedAdditionsPence: z.number(), approvedOmissionsPence: z.number(), pendingExtrasPence: z.number(),
  variations: z.array(id.extend({ state: z.string() })) });
const proof = z.object({ upload: id.extend({ state: z.string() }).nullable(), completion: id.nullable() });
const account = z.object({ account: id.extend({ issueBlocked: z.boolean(), totals: z.object({ total: z.object({ pence: z.number() }) }) }).nullable() });
const lock = z.object({ lock: id.nullable() });
const check = z.object({ state: z.string(), runId: uuid.nullable().optional() });
const invoice = id.extend({ number: z.string(), totalPence: z.number(), balancePence: z.number() });
const invoices = z.object({ invoices: z.array(invoice) });
const receipts = z.object({ invoice, receipts: z.array(id.extend({ reversal: z.unknown().nullable() })) });
const credits = z.object({ credits: z.array(id.extend({ number: z.string(), totalPence: z.number() })) });
const value = z.object({ invoicedGross: z.object({ pence: z.number(), sources: z.array(z.object({ id: uuid, href: z.string() })) }), outstandingGross: z.object({ pence: z.number() }) });

export type Core1000Row = { id: string; screen: string; state: string; done: boolean; href: string; record: string | null };
export type Core1000Report = { jobId: string; complete: boolean; rows: Core1000Row[] };

/** Every row is derived only from a saved read. A refused or absent read means "Not done yet". */
export async function readCore1000Report(jobId: string, fetcher: typeof fetch = fetch): Promise<Core1000Report> {
  const root = `/api/jobs/${uuid.parse(jobId)}`, job = `/jobs/${jobId}`;
  async function read<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const response = await fetcher(`${root}/${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  }
  const [captured, quote, live, extras, photo, final, locked, finalCheck, issued, worth] = await Promise.all([
    read("proposal", proposal), read("quotes", quotes), read("quotes/activation", activation), read("variations", variations),
    read("proof", proof), read("final-account", account), read("final-account/lock", lock), read("final-check", check),
    read("customer-invoices", invoices), read("value", value)]);
  const accepted = captured?.review?.lines.filter(line => line.disposition === "accepted").length ?? 0;
  const latest = quote?.revisions.at(-1), started = live?.activation ?? null, bill = final?.account ?? null, sent = issued?.invoices[0];
  const paid = sent ? await read(`customer-invoices/${sent.id}/receipts`, receipts) : null;
  const corrected = sent ? await read(`customer-invoices/${sent.id}/credit-notes`, credits) : null;
  const reversed = paid?.receipts.filter(item => item.reversal).length ?? 0, note = corrected?.credits[0];
  const invoiceScreen = sent ? worth?.invoicedGross.sources.find(source => source.id === sent.id)?.href ?? `${job}#invoice-${sent.id}` : job;
  const rows: Core1000Row[] = [
    { id: "confirmation", screen: "Cited job confirmation", done: accepted === 5, state: `${accepted} of 5 cited lines confirmed`, href: core1000Link(jobId), record: null },
    { id: "quote", screen: "Quote", done: !!latest, state: latest ? `Revision ${latest.revision}: ${pounds(latest.netPence)} net` : "No quote revision saved", href: job, record: latest?.id ?? null },
    { id: "switch-live", screen: "Acceptance and switch-live", done: !!started && started.recoveryCapPence === null, state: started ? `Live at ${pounds(live?.terms?.acceptedNetPence ?? 0)} on ${started.policyVersion}; no recovery cap` : "Not live", href: job, record: started?.id ?? null },
    { id: "extras", screen: "Approved extras", done: !!extras && extras.approvedAdditionsPence > 0, state: extras ? `Approved +${pounds(extras.approvedAdditionsPence)} and −${pounds(Math.abs(extras.approvedOmissionsPence))}; pending ${pounds(extras.pendingExtrasPence)}` : "No extras read", href: job, record: extras?.variations[0]?.id ?? null },
    { id: "proof", screen: "Verified proof", done: photo?.upload?.state === "verified" && !!photo.completion, state: photo?.completion ? `Proof ${photo.upload?.state ?? "missing"}; stage complete` : "No completed proof", href: job, record: photo?.completion?.id ?? null },
    { id: "final-account", screen: "Final account", done: !!bill && !bill.issueBlocked, state: bill ? `${pounds(bill.totals.total.pence)} gross` : "Not built", href: `${job}#final-account-title`, record: bill?.id ?? null },
    { id: "final-check", screen: "Final Check", done: !!locked?.lock && finalCheck?.state === "completed", state: locked?.lock ? `Bill locked; check ${finalCheck?.state ?? "unavailable"}` : "Bill not locked", href: `${job}#final-check`, record: finalCheck?.runId ?? locked?.lock?.id ?? null },
    { id: "invoice", screen: "Customer invoice", done: !!sent, state: sent ? `${sent.number}: ${pounds(sent.totalPence)} gross` : "No invoice issued", href: invoiceScreen, record: sent?.id ?? null },
    { id: "receipts", screen: "Payments and reversal", done: !!paid && paid.receipts.length > 0, state: paid ? `${paid.receipts.length} receipts, ${reversed} reversed` : "No receipts", href: invoiceScreen, record: paid?.receipts[0]?.id ?? null },
    { id: "correction", screen: "Correction", done: !!note, state: note ? `${note.number}: ${pounds(Math.abs(note.totalPence))} credit; balance ${pounds(paid?.invoice.balancePence ?? 0)}` : "No correction", href: invoiceScreen, record: note?.id ?? null },
    { id: "value", screen: "Source-linked job value", done: !!worth && (worth.invoicedGross.sources.length > 0), state: worth ? `${pounds(worth.invoicedGross.pence)} invoiced; ${pounds(worth.outstandingGross.pence)} outstanding` : "Unavailable", href: `${job}/value`, record: null },
  ];
  return { jobId, complete: rows.every(row => row.done), rows };
}
