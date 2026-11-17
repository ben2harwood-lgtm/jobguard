# ENT-3d — site extra evidence v1

Built 13 October 2026 (builder receipt only; not independently verified, not accepted). Coordinator rulings of 12 October
(Q7 to Q11 and the adopted answers Q2 to Q5). Server side only: no screen, no upload route, no new route, no new table, no column.

`LogSiteExtra` has three body versions across the ENT-3 pieces. **v2 and v3 of `LogSiteExtra` are separate extensions of v1, not a
sequence.** Each only adds to v1 and removes, renames or changes the meaning of nothing; a v1 body keeps exactly today's result, byte
for byte. This document describes v3 only. v3 carries only a photo and a resident confirmation; it has no visit and reads no
other piece's field.

## Definitions

- **Verified site photo of a job:** a row `e` of `app.evidence_object` in the current tenant with `e.job_id` = the job,
  `e.kind='original'`, `e.evidence_type='site_photo'`, `e.content_type` one of `image/jpeg`, `image/png`, `image/webp`, whose
  upload row (`app.evidence_upload` with the same tenant, job and `id = e.upload_id`) has `state='verified'` and the same
  `object_version_id`, and for which no row of `app.evidence_invalidation` exists. Everything else is "not accepted": an unknown
  id, another tenant's or another job's object, a pending, quarantined or rejected upload, another type, a preview, an
  invalidated object, a confirmation document. A photo refusal is one answer for every cause.
- **Content hash, `site-extra-content.v1`:** the lower-case hex SHA-256 of the UTF-8 bytes of the text
  `site-extra-content.v1` + LF + enc(job id) + enc(description) + enc(note) + enc(photo SHA-256), where enc(NULL) is `N;` and
  enc(text) is `S` + the UTF-8 byte length in decimal + `:` + the text + `;`. This is the framing merged `extraOriginHashV1`
  uses. The job id is canonical lower-case text. Description and note are taken exactly as stored: no trimming, no
  normalisation. The photo SHA-256 is the 64-character `evidence_object.sha256`, or NULL when the command names no photo.
  Quantity and price are not in v1; they join in ENT-3c as a new format version.
- **Confirmation document, `resident-confirmation.v1`:** seven lines, each ended by one LF (no CR, nothing after the last LF),
  UTF-8: `jobguard-resident-confirmation.v1`; `tenant:<tenant id>`; `job:<job id>`; `confirmation:<confirmation id>`;
  `content-format:site-extra-content.v1`; `content-sha256:<content hash>`;
  `statement:confirmed on the operative's device; identity not verified` (plain ASCII apostrophe). It holds nothing about the
  resident and nothing else.
- **Confirmation id:** merged `derivedUuid("resident-confirmation:" + tenant + ":" + job + ":" + command id)`, all lower case.
- **Confirmation object:** one `app.evidence_upload` row and one `app.evidence_object` row, both with `id` = the confirmation id.
  Object: `upload_id` = the id, `scope_item_id` NULL, `kind='original'`, `evidence_type='resident_confirmation'`,
  `object_key` = `tenants/<tenant>/resident-confirmations/<id>/document`, `object_version_id='resident-confirmation.v1'`,
  `sha256` and `byte_length` of the document, `content_type='text/plain; charset=utf-8'`, `retention_class='standard_evidence'`,
  `device_captured_at` NULL, `server_received_at` = `server_verified_at` = one `clock_timestamp()`. Upload: same key, expected
  hash, `maximum_bytes` = the length, same content type and retention, `state='verified'`, same version, the same time for
  `server_received_at`, `server_verified_at` and `expires_at`, `rejection_code` NULL.
- **Bound:** a confirmation object is bound to an extra when its `sha256` and `byte_length` equal those of the document rebuilt
  from the extra's own STORED facts (tenant, job, the object's id, and the content hash from `variation.description`,
  `variation.capture_text` and `extra_origin.evidence_hash`).
- **The hash shown:** the value in `residentConfirmation.shownContentSha256`, what the device says it displayed. The server only
  compares it with its own content hash; it is never trusted and never stored as content.

## Worked examples

Content hash. Inputs: job `11111111-1111-4111-8111-111111111111`, description `Fictional extra door`, note
`Fictional note about extra work`, photo SHA-256 `abab…ab` (`ab` repeated 32 times). The framed text is

    site-extra-content.v1<LF>S36:11111111-1111-4111-8111-111111111111;S20:Fictional extra door;S31:Fictional note about extra work;S64:abababababababababababababababababababababababababababababababab;

and its SHA-256 is `e33c42e80a3b56166adf87c799b306553cafa22142425805e0c20005de511fc3`. Without a photo the last field is `N;` and
the hash is `ad0f0864361fe93a6130c3d463543745396374ff07dfe06ffc26dcd8948ff90a`.

Document. Tenant `22222222-2222-4222-8222-222222222222`, confirmation `33333333-3333-4333-8333-333333333333`, the content hash above:

    jobguard-resident-confirmation.v1
    tenant:22222222-2222-4222-8222-222222222222
    job:11111111-1111-4111-8111-111111111111
    confirmation:33333333-3333-4333-8333-333333333333
    content-format:site-extra-content.v1
    content-sha256:e33c42e80a3b56166adf87c799b306553cafa22142425805e0c20005de511fc3
    statement:confirmed on the operative's device; identity not verified

355 bytes; SHA-256 `39e6221b936df6751850aef209a5eac225ed59fc37237e9e659eebf0a58ce2c3`.

## The body and the answer

`log-site-extra.v3`, strict: `{ version, commandId, note, description, photoEvidenceId?, residentConfirmation?: { shownContentSha256 } }`.
`note` and `description` are validated exactly as v1. The request can never supply the document, its hash, label, type, key,
times, a name, a signature or any authority field; the only evidence values are one photo id and the hash shown. A note stays
required (a photo with no note is HELD). The answer is `site-extra-logged.v3`: the v1 fields plus
`evidence: { photoEvidenceId | null, residentConfirmationEvidenceId | null, contentFormat, contentSha256 }`.

Two new refusals, both HTTP 422 and both the code-only envelope with `Cache-Control: no-store`: `PHOTO_NOT_ACCEPTED` (one answer for
every cause) and `CONFIRMATION_MISMATCH` (the hash shown is not the server's content hash). A caller ENT-3a refuses gets ENT-3a's
own answer before any evidence is looked at. A job that is not live gives `409 JOB_NOT_LIVE` and writes nothing. A command id
reused with a different request is `409 IDEMPOTENCY_CONFLICT`.

## The five routines (schema `app`, SECURITY INVOKER, search path `pg_catalog`, owner `jobguard_migration`)

1. `ent3d_content_sha256(p_job uuid, p_description text, p_note text, p_photo_sha256 text) RETURNS text`, IMMUTABLE.
2. `ent3d_confirmation_document(p_tenant uuid, p_job uuid, p_confirmation uuid, p_content_sha256 text) RETURNS text`, IMMUTABLE.
3. `ent3d_site_extra_evidence(p_job uuid, p_description text, p_note text, p_photo uuid, p_confirmation uuid, p_variation uuid) RETURNS TABLE(decision text, reason_code text, photo_sha256 text, content_sha256 text)`, STABLE, writes nothing.
4. `ent3d_record_resident_confirmation(p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text) RETURNS TABLE(outcome text, reason_code text, content_sha256 text, document_sha256 text)`, VOLATILE. The only writer of a confirmation object; carries its own authority check (`ent3a_extra_authority`); no parameter for the document, hash, type, key, label or time.
5. `ent3d_require_site_extra_evidence(p_job uuid, p_variation uuid) RETURNS void`, VOLATILE. The guard in ENT-4b's seam, after ENT-3a's two statements; it decides on the stored origin and variation rows and raises `INVALID_ORIGIN` (23514) otherwise.

`jobguard_runtime` gets EXECUTE on exactly these five by an explicit list; PUBLIC and `jobguard_infrastructure` get none. No table,
column, index, trigger, constraint, policy or table grant is added; pre-existing direct write grants of the application login on
the two evidence tables are used and none added.

## Flow (one command, three short steps)

After ENT-3a's caller, tenant and authority pre-check (which also requires a live job): a command that already succeeded is
answered from its stored facts and never judged against the job's current state; otherwise (i) a read-only decision on the photo
and the hash shown; (ii) only when a hash was shown, one transaction that records the document and appends one
`contractor.extra.resident_confirmation_recorded` audit event (ids and hashes only) as its last statement; (iii) merged
`raiseExtra`, with the seam running ENT-3a's two guards and then routine 5.

## Limits

- **L1** The checks bind the governed path. A raw runtime-role write, or merged `raiseExtra` called without the seam, is not checked.
- **L2** The server cannot know that a resident pressed anything: the record says a signed-in member's device reported it, and the document says "identity not verified".
- **L3** The document is committed before the extra. If the second step is refused, an unused document remains; only a document named by an origin row counts, and a retry of the same command reuses it.
- **L4** Check-then-act: a photo invalidated after the guard read it and before the command commits is not caught.
- **L5** Only the practice owner can hold a practice session today and an owner may not log a site extra, so no signed-in person can reach the success path yet; it is proved through the governed path in the database tests and at service level.
- **L6** The document's bytes are not stored as a file; they are rebuilt exactly from stored facts. The object row pins hash, length and type; the recorded event carries the content hash.
- **L7** "Bound to its revision" is met only as "bound to the content hash, format v1".

## HELD (built none of it)

Logging with a photo and no note (changes merged `raise-extra.v1`); any way to capture or upload a photo on a contractor job and any
upload route; a typed name, a signature or anything about the resident; quantity and price in the content hash (ENT-3c); stored
bytes for the document; a table-level guard that binds every writer; screens (ENT-3e); visits and close-out (ENT-3b); evidence packs
or a client approver's view for contractor jobs; retention and the data-protection assessment for resident data; state rules and
submission (ENT-5); `ConfirmPrompt` (ENT-8a); linking and un-linking (ENT-4c); fees (ENT-7).
