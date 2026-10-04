import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { evidencePackFailure } from './evidence-pack.errors.js';

describe('evidence pack failure mapping', () => {
  it.each([
    ['UNAUTHENTICATED', 401], ['FORBIDDEN', 403], ['SYNTHETIC_MODE_REQUIRED', 400],
    ['EVIDENCE_PACK_NOT_FOUND', 404], ['EVIDENCE_PACK_CASE_NOT_FOUND', 404], ['EVIDENCE_PACK_SOURCE_NOT_FOUND', 404],
    ['EVIDENCE_PACK_STALE_APPROVAL', 409], ['EVIDENCE_PACK_COMMAND_CONFLICT', 409],
    ['EVIDENCE_PACK_REBUILD_REQUIRED', 400], ['EVIDENCE_PACK_CONTENT_MISMATCH', 400],
  ])('keeps the typed code %s as HTTP %i', (code, status) => {
    expect(evidencePackFailure(new Error(code))).toEqual({ status, code });
  });
  it('maps malformed commands (schema or JSON) to a fixed INVALID_COMMAND 400 without their text', () => {
    expect(evidencePackFailure(new ZodError([]))).toEqual({ status: 400, code: 'INVALID_COMMAND' });
    expect(evidencePackFailure(new SyntaxError('Unexpected token } in JSON at position 41'))).toEqual({ status: 400, code: 'INVALID_COMMAND' });
  });
  it.each([new Error('connect ECONNREFUSED 10.0.0.5:5432'), Object.assign(new Error('permission denied for table evidence_pack'), { code: '42501' }), 'a thrown string', undefined])(
    'maps anything unrecognised to a fixed INTERNAL_ERROR 500', error => {
      expect(evidencePackFailure(error)).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
    });
});
