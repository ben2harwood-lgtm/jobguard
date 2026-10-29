import { z } from "zod";
import { DeepgramFixtureAdapter, type RegisteredSpeechAudioReader } from "@jobguard/ai";
import { CaptureRepository, type VerifiedTenantContext } from "@jobguard/db";

/** Dark server-only entry point. Not registered in any module/controller/HTTP route.
 * Only a server-selected deterministic fixture may become a capture proposal.
 * Partial recognition returns a recoverable review result and never writes capture. */
export class DeepgramFixtureCaptureService {
  constructor(private readonly adapter: DeepgramFixtureAdapter,
    private readonly audio: RegisteredSpeechAudioReader, private readonly repository: CaptureRepository) {}

  async capture(context: VerifiedTenantContext, raw: unknown) {
    const result = await this.adapter.capture(context.tenantId, raw, this.audio);
    if (result.status !== "ready") return result;
    const captureId = z.object({ captureId: z.guid() }).parse(raw).captureId;
    const saved = await this.repository.persistSpeechFixtureSource(context,captureId,result.source);
    return { ...result, saved };
  }
}
