import { AiGatewayError } from "./errors.js";
import type { AiGatewayRequest, AiProvider } from "./types.js";

export type RecordedFixture = {
  readonly output: unknown;
  readonly citations: readonly { sourceId: string; start: number; end: number }[];
};

/** A deterministic, zero-spend provider. It has no network or vendor dependency. */
export class FixtureAiProvider implements AiProvider {
  readonly kind = "fixture" as const;

  constructor(private readonly fixtures: Readonly<Record<string, RecordedFixture>>) {}

  async execute(request: AiGatewayRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new AiGatewayError("cancelled", "AI fixture request was cancelled");
    const fixture = this.fixtures[request.fixtureId];
    if (!fixture) throw new AiGatewayError("fixture_not_found", `Unknown AI fixture: ${request.fixtureId}`);
    return {
      ...fixture,
      provider: "recorded-fixture",
      model: "fixture-v1",
      deployment: "local-only",
      fixtureId: request.fixtureId,
      costPence: 0,
    };
  }
}

/**
 * Deliberate future-provider seam. D04 is proposed, so no live implementation or
 * configuration can be constructed in M0-12.
 */
export function createLiveAiProvider(): never {
  throw new AiGatewayError(
    "live_route_disabled",
    "Live AI routes are not implemented and remain blocked pending approved D04 evidence",
  );
}
