import type { Pool } from 'pg';
import { z } from 'zod';
import { EnterpriseLivePromptRepository } from '@jobguard/db';
import { materialsIssueV1, materialsIssueBodyV1, completionObservationV1, completionObservationBodyV1, evaluateLivePromptsV1, confirmPromptV1, dismissPromptV1, promptListV1, promptDetailV1, EnterpriseLivePromptPersistenceError } from '@jobguard/core';
import { workOrderPrincipalV1 } from './work-order.contracts.js';
export class PromptBoundaryError extends Error {
 constructor(readonly code: 'MODE_FORBIDDEN' | 'UNAUTHENTICATED' | 'ORIGIN_FORBIDDEN' | 'INVALID_PROMPT_COMMAND') { super(code); }
}
const listQuery = z.object({ limit: z.string().regex(/^[1-9]\d{0,2}$/u).transform(Number).pipe(z.number().int().min(1).max(100)).optional(), after: z.guid({ error: "Invalid uuid" }).optional() }).strict();
/** The persisted session is the only authority. Repository checked routines recheck current authority under lock. */
export class EnterpriseLivePromptApplication {
 private readonly repository: EnterpriseLivePromptRepository;
 constructor(pool: Pool) { this.repository = new EnterpriseLivePromptRepository(pool); }
 private session(principal: unknown): string {
  if (process.env.JOBGUARD_ENV !== 'synthetic_demo') throw new PromptBoundaryError('MODE_FORBIDDEN');
  const parsed = workOrderPrincipalV1.safeParse(principal);
  if (!parsed.success) throw new PromptBoundaryError('UNAUTHENTICATED');
  return parsed.data.sessionId;
 }
 private parse(schema: { safeParse(value: unknown): { success: boolean; data?: unknown } }, raw: unknown): Record<string, unknown> {
  const parsed = schema.safeParse(raw); if (!parsed.success) throw new PromptBoundaryError('INVALID_PROMPT_COMMAND'); return parsed.data as Record<string, unknown>;
 }
 async list(principal: unknown, jobId: string, raw: unknown) {
  const session = this.session(principal), query = this.parse(listQuery, raw);
  return this.repository.list(session, this.parse(promptListV1, { version: "live-prompt-list.v1", ...query, jobId }));
 }
 async detail(principal: unknown, jobId: string, promptId: string) {
  const session = this.session(principal);
  return this.repository.detail(session, this.parse(promptDetailV1, { version: "live-prompt-detail.v1", jobId, promptId }));
 }
 async importMaterials(principal: unknown, jobId: string, raw: unknown) {
  const session = this.session(principal), body = this.parse(materialsIssueBodyV1, raw);
  return this.repository.importMaterials(session, this.parse(materialsIssueV1, { ...body, jobId }));
 }
 async registerObservation(principal: unknown, jobId: string, raw: unknown) {
  const session = this.session(principal), body = this.parse(completionObservationBodyV1, raw);
  return this.repository.registerObservation(session, this.parse(completionObservationV1, { ...body, jobId }));
 }
 async evaluate(principal: unknown, jobId: string, raw: unknown) {
  const session = this.session(principal), body = this.parse(evaluateLivePromptsV1.omit({ jobId: true }), raw);
  return this.repository.evaluate(session, this.parse(evaluateLivePromptsV1, { ...body, jobId }));
 }
 async confirm(principal: unknown, jobId: string, promptId: string, raw: unknown) {
  const session = this.session(principal), body = this.parse(confirmPromptV1.omit({ jobId: true, promptId: true }), raw);
  return this.repository.confirm(session, this.parse(confirmPromptV1, { ...body, jobId, promptId }));
 }
 async dismiss(principal: unknown, jobId: string, promptId: string, raw: unknown) {
  const session = this.session(principal), body = this.parse(dismissPromptV1.omit({ jobId: true, promptId: true }), raw);
  return this.repository.dismiss(session, this.parse(dismissPromptV1, { ...body, jobId, promptId }));
 }
}
export function enterpriseLivePromptHttpFailure(error: unknown) {
 const code = error instanceof PromptBoundaryError || error instanceof EnterpriseLivePromptPersistenceError ? error.code : (error as { code?: unknown } | null)?.code === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'PROMPT_UNAVAILABLE';
 const status = code === 'UNAUTHENTICATED' ? 401 : ['MODE_FORBIDDEN', 'ORIGIN_FORBIDDEN', 'EXTRA_FORBIDDEN', 'PROMPT_PRACTICE_ONLY'].includes(code) ? 403 : code === 'INVALID_PROMPT_COMMAND' ? 400 : code === 'PROMPT_UNAVAILABLE' ? 503 : 409;
 return { status, body: { version: 'enterprise-live-prompt-error.v1', code } };
}
