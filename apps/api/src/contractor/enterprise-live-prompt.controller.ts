import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Pool } from 'pg';
import { EnterpriseLivePromptApplication, enterpriseLivePromptHttpFailure, PromptBoundaryError } from './enterprise-live-prompt.application.js';
const principal = (cookie?: string) => ({ version: 'contractor-principal.v1', sessionId: cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('jg_session='))?.slice(11) });
const fail = (error: unknown): never => { const failure = enterpriseLivePromptHttpFailure(error); throw new HttpException(failure.body, failure.status); };
export function assertPromptOrigin(origin: string | undefined): void {
 const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',').map(value => value.trim());
 if (!origin || origin === 'null' || !allowed.includes(origin)) fail(new PromptBoundaryError('ORIGIN_FORBIDDEN'));
}
const uuid = { type: 'string', format: 'uuid' } as const;
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;
const text = { type: 'string', minLength: 1, maxLength: 200 } as const;
function commandBody(version: string, properties: Record<string, object> = {}, optional: Record<string, object> = {}) {
 return { schema: { type: 'object', additionalProperties: false, required: ['version', 'commandId', ...Object.keys(properties)], properties: { version: { type: 'string', enum: [version] }, commandId: uuid, ...properties, ...optional } } };
}
@ApiTags('contractor-possible-extras')
@ApiParam({ name: 'id', type: String, format: 'uuid' })
@Controller('contractor/jobs/:id/possible-extras')
export class EnterpriseLivePromptController {
 private readonly application: EnterpriseLivePromptApplication;
 constructor(@Inject(Pool) pool: Pool) { this.application = new EnterpriseLivePromptApplication(pool); }
 @Get() @Header('Cache-Control', 'no-store')
 @ApiOperation({ summary: 'Read the paginated Possible extras lane for a covered job' })
 @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
 @ApiQuery({ name: 'after', required: false, type: String, format: 'uuid' })
 list(@Param('id') jobId: string, @Headers('cookie') cookie: string | undefined, @Query() query: unknown) {
  return this.application.list(principal(cookie), jobId, query).catch(fail);
 }
 @Get(':promptId') @Header('Cache-Control', 'no-store')
 @ApiOperation({ summary: 'Read one cited possible extra with immutable resolution history' })
 @ApiParam({ name: 'promptId', type: String, format: 'uuid' })
 detail(@Param('id') jobId: string, @Param('promptId') promptId: string, @Headers('cookie') cookie: string | undefined) {
  return this.application.detail(principal(cookie), jobId, promptId).catch(fail);
 }
 @Post('materials') @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiBody(commandBody('materials-issue.v1', { sourceId: text, eventId: text, workIdentity: text, unit: text, quantity: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,17})(?:\\.\\d{1,6})?$' }, occurredAtMicros: { type: 'string', pattern: '^[0-9]+$' }, kind: { type: 'string', enum: ['issue', 'return', 'correction'] } }))
 @ApiOperation({ summary: 'Import strict materials issue facts and evaluate atomically; finance or owner only' })
 materials(@Param('id') jobId: string, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() body: unknown) {
  assertPromptOrigin(origin); return this.application.importMaterials(principal(cookie), jobId, body).catch(fail);
 }
 @Post('observations') @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiBody(commandBody('completion-observation.v1', { evidenceId: uuid, sha256: hash, objectVersion: text, locator: { type: 'object', description: 'Strict versioned completion-work locator; exact stored span or photo tag' }, workIdentity: text }, { sourceText: { type: 'string', maxLength: 100000, description: 'Required only for a text_span; forbidden for photo_tag, whose tags are read from stored PNG bytes' } }))
 @ApiOperation({ summary: 'Register completion observations bound to stored immutable evidence' })
 observation(@Param('id') jobId: string, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() body: unknown) {
  assertPromptOrigin(origin); return this.application.registerObservation(principal(cookie), jobId, body).catch(fail);
 }
 @Post('evaluate') @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiBody(commandBody('evaluate-live-prompts.v1'))
 @ApiOperation({ summary: 'Evaluate authoritative persisted sources in synthetic practice mode' })
 evaluate(@Param('id') jobId: string, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() body: unknown) {
  assertPromptOrigin(origin); return this.application.evaluate(principal(cookie), jobId, body).catch(fail);
 }
 @Post(':promptId/confirm') @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiBody(commandBody('confirm-prompt.v1', { promptHash: hash }, { confirmedWorkIdentity: text, excessScopeItemId: uuid, existingExtraId: uuid }))
 @ApiOperation({ summary: 'Confirm the exact cited prompt or coalesce into an existing extra; no pricing or approval' })
 @ApiParam({ name: 'promptId', type: String, format: 'uuid' })
 confirm(@Param('id') jobId: string, @Param('promptId') promptId: string, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() body: unknown) {
  assertPromptOrigin(origin); return this.application.confirm(principal(cookie), jobId, promptId, body).catch(fail);
 }
 @Post(':promptId/dismiss') @HttpCode(201) @Header('Cache-Control', 'no-store') @ApiBody(commandBody('dismiss-prompt.v1', { promptHash: hash, reason: { type: 'string', minLength: 1, maxLength: 2000 } }))
 @ApiOperation({ summary: 'Dismiss the exact prompt with a reason and immutable resolution' })
 @ApiParam({ name: 'promptId', type: String, format: 'uuid' })
 dismiss(@Param('id') jobId: string, @Param('promptId') promptId: string, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() body: unknown) {
  assertPromptOrigin(origin); return this.application.dismiss(principal(cookie), jobId, promptId, body).catch(fail);
 }
}
