import { Injectable } from "@nestjs/common";
import { extractCaptureFixture, PINNED_CAPTURE_MODEL } from "@jobguard/ai";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, captureRequestV1 } from "@jobguard/core";
import { CaptureRepository, type VerifiedTenantContext } from "@jobguard/db";
@Injectable()
export class CaptureService {
  constructor(private readonly repository:CaptureRepository){}
  async capture(context:VerifiedTenantContext,raw:unknown){const input=captureRequestV1.parse(raw);if(input.requested_tenant_id!==context.tenantId)throw new Error("TENANT_FORBIDDEN");const proposal=await extractCaptureFixture(input.captureId,input.source.text,input.fixtureId);return this.repository.persist(context,{captureId:input.captureId,text:input.source.text,sourceKind:input.source.kind,acquisition:input.source.kind==="browser_local_transcript"?input.source.acquisition:null,proposal,promptVersion:CAPTURE_PROMPT_VERSION,schemaVersion:CAPTURE_SCHEMA_VERSION,model:PINNED_CAPTURE_MODEL});}
}
