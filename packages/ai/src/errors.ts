export type AiGatewayErrorCode =
  | "invalid_request"
  | "fixture_not_found"
  | "invalid_provider_response"
  | "invalid_output"
  | "invalid_citation"
  | "cancelled"
  | "live_route_disabled";

export class AiGatewayError extends Error {
  override readonly name = "AiGatewayError";

  constructor(
    readonly code: AiGatewayErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
