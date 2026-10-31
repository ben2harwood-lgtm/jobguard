import { z } from 'zod';
import { PracticeTransport, PracticeError } from './transport';
const Id = z.string().uuid();
const Pence = z.number().int().safe().nonnegative();
const ExtraSchema = z.object({ extraId: Id, jobId: Id, orderReference: z.string(), description: z.string().max(500), note: z.string().max(5000), state: z.string(), hasPhoto: z.boolean(), residentConfirmed: z.boolean(), quotedPence: Pence.nullable(), netPence: Pence.nullable(), requestId: Id.nullable(), revisionHash: z.string().nullable(), steps: z.array(z.object({ index: z.number().int(), role: z.string(), done: z.boolean() })), nextStepIndex: z.number().int().nullable(), nextStepRole: z.string().nullable(), clientRequired: z.boolean(), linkIssued: z.boolean(), linkClosed: z.string().nullable(), outcome: z.string().nullable() });
const Rate = z.object({ code: z.string(), description: z.string(), unit: z.string(), ratePence: Pence });
const SummarySchema = z.object({ version:z.literal('northside-summary.v1'), environment:z.literal('synthetic_demo'), realExternalActions:z.literal(0), seeded:z.literal(true), role: z.string(), membershipId: Id, settings: z.object({ version: z.string(), label: z.string(), notice: z.string() }) });
const ExtrasSchema = z.object({ role: z.string(), extras: z.array(ExtraSchema), rates: z.record(z.array(Rate)).default({}), queue: z.array(z.object({ variation_id: Id, request_id: Id, step_index: z.number().int() })).default([]), localLinks: z.array(z.object({ extraId: Id, path: z.string().startsWith('/extra-approval/').max(2048), recipient: z.string() })).default([]) });
const JobsSchema = z.object({ version:z.literal('site-assigned-jobs.v1'), environment:z.literal('synthetic_demo'), realExternalActions:z.literal(0), jobs: z.array(z.object({ jobId: Id, reference: z.string() })) });
export const PhotoSchema = z.object({ version:z.literal('northside-photo.v1'), environment:z.literal('synthetic_demo'), realExternalActions:z.literal(0), photoEvidenceId: Id, photoSha256: z.string().regex(/^[a-f0-9]{64}$/i), shownContentSha256: z.string().regex(/^[a-f0-9]{64}$/i) });
export type PracticePhoto = z.infer<typeof PhotoSchema>;
export type PracticeExtra = z.infer<typeof ExtraSchema>;
export type PracticeView = z.infer<typeof ExtrasSchema> & { summary: z.infer<typeof SummarySchema> };
/** Contracts source-inspected at ENT-11a 75211e2. Not a claim of deployed integration. */
export class NorthsideClient {
  constructor(readonly transport: PracticeTransport) {}
  async load(): Promise<PracticeView> {
    const [summary, extras] = await Promise.all([this.transport.read('/api/northside'), this.transport.read('/api/northside/extras')]);
    try { const s = SummarySchema.parse(summary); const e = ExtrasSchema.parse(extras); if (s.role !== e.role) throw new Error('Role changed'); return { ...e, summary: s }; }
    catch { throw new PracticeError('The practice contract or signed-in role changed. Reconnect after reviewing the existing practice app.', 'invalid'); }
  }
  async jobs() { return JobsSchema.parse(await this.transport.read('/api/contractor/site/jobs')).jobs; }
  async photo(jobId: string, description: string, note: string) {
    const input = z.object({ jobId: Id, description: z.string().trim().min(1).max(500), note: z.string().trim().min(1).max(5000) }).parse({ jobId, description, note });
    const result = await this.transport.write('/api/northside/photo', { version: 'northside-command.v1', ...input });
    const photo = PhotoSchema.parse(result); this.transport.confirmedByValidatedResponse(); return photo;
  }
  async capture(jobId: string, description: string, note: string, photo: z.infer<typeof PhotoSchema>, commandId: string) {
    Id.parse(jobId); Id.parse(commandId); PhotoSchema.parse(photo);
    const input = z.object({ description: z.string().trim().min(1).max(500), note: z.string().trim().min(1).max(5000) }).parse({ description, note });
    // The existing command binds acknowledgement to the server-produced shown-content hash.
    const result = await this.transport.write(`/api/contractor/jobs/${jobId}/site-extras`, { version: 'log-site-extra.v3', commandId, ...input, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 } });
    const receipt = z.object({version:z.literal('site-extra-logged.v3'),environment:z.literal('synthetic_demo'),realExternalActions:z.literal(0),jobId:Id,extraId:Id,state:z.literal('logged'),evidence:z.object({photoEvidenceId:Id,residentConfirmationEvidenceId:Id,contentSha256:z.string().regex(/^[a-f0-9]{64}$/i),contentFormat:z.literal('site-extra-content.v1')})}).parse(result);
    if(receipt.jobId!==jobId||receipt.evidence.photoEvidenceId!==photo.photoEvidenceId||receipt.evidence.contentSha256!==photo.shownContentSha256) throw new PracticeError('The capture receipt does not match the reviewed work. Inspect the recorded outcome.', 'unknown');
    this.transport.confirmedByValidatedResponse(); return receipt;
  }
  async action(extra: PracticeExtra, action: 'price' | 'submit' | 'approve' | 'send', fields: { sorCode?: string; quantity?: number } = {}) {
    ExtraSchema.parse(extra);
    const body: Record<string, unknown> = { version: 'northside-command.v1', jobId: extra.jobId, commandId: crypto.randomUUID() };
    if (action === 'price') Object.assign(body, z.object({ sorCode: z.string().min(1), quantity: z.number().int().positive().max(1000) }).parse(fields));
    if (action === 'approve' || action === 'send') {
      if (!extra.requestId || !extra.revisionHash || extra.netPence === null || (action === 'approve' && extra.nextStepIndex === null)) throw new PracticeError('The exact approval revision is missing. Reload before acting.', 'invalid');
      Object.assign(body, { requestId: extra.requestId, revisionHash: extra.revisionHash, netPence: extra.netPence, ...(action === 'approve' ? { stepIndex: extra.nextStepIndex } : {}) });
    }
    const result = await this.transport.write(`/api/northside/extras/${extra.extraId}/${action}`, body);
    const versions={price:'northside-priced.v1',submit:'northside-submitted.v1',approve:'northside-approved.v1',send:'northside-link.v1'} as const;
    const receipt=z.object({version:z.literal(versions[action]),environment:z.literal('synthetic_demo'),realExternalActions:z.literal(0),result:z.unknown()}).parse(result);
    if(action==='send') z.object({recipient:z.string().endsWith('.invalid'),path:z.string().startsWith(`/extra-approval/${extra.jobId}/${extra.requestId}#t=`)}).parse(result);
    // Route wraps a completed repository command. Validate the persisted read, not a local transition.
    const view=await this.load(); const stored=view.extras.find(e=>e.extraId===extra.extraId);
    if(!stored)throw new PracticeError('The updated record is not available for this role. Inspect the recorded outcome.', 'unknown');
    if(action==='price'){const priced=z.object({netPence:Pence}).parse(result);if(stored.quotedPence!==priced.netPence)throw new PracticeError('The refreshed price does not match the receipt. Reconcile before another action.', 'unknown');}
    if(action==='submit'&&!stored.requestId)throw new PracticeError('No approval request was found after submission.', 'unknown');
    if(action==='approve'&&stored.nextStepIndex===extra.nextStepIndex&&stored.outcome===extra.outcome)throw new PracticeError('The approval step has not been confirmed by the refreshed record.', 'unknown');
    if(action==='send'&&!stored.linkIssued)throw new PracticeError('The local client link was not confirmed by the refreshed record.', 'unknown');
    this.transport.confirmedByValidatedResponse(); return {receipt,view};
  }
}
