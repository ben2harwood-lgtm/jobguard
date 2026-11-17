import { z } from "zod";

// Local fictional labels only; this is not a production secret-store or transport profile.
const fixtureReference = z.string().regex(/^fixture:[a-z0-9_-]+$(?![\s\S])/u);
const connectorEnvironmentV1 = z.object({
  CONNECTOR_CONFIG_VERSION: z.literal("connector-environment.v1"),
  JOBGUARD_ENV: z.literal("synthetic_demo"),
  CONNECTOR_ENDPOINT_KIND: z.literal("fake"),
  CONNECTOR_ENDPOINT_REF: fixtureReference,
  CONNECTOR_CREDENTIAL_REF: fixtureReference,
}).strict();

export type ConnectorEnvironment = Readonly<z.infer<typeof connectorEnvironmentV1>>;

export class ConnectorConfigurationError extends Error {
  readonly code = "CONNECTOR_CONFIGURATION_INVALID";
  constructor() {
    super("Connector configuration is invalid or unavailable");
    this.name = "ConnectorConfigurationError";
  }
}

/** Validate dedicated server configuration only. This parser enables no runtime route. */
export function parseConnectorEnvironment(raw: unknown): ConnectorEnvironment {
  const result = connectorEnvironmentV1.safeParse(raw);
  if (!result.success) throw new ConnectorConfigurationError();
  return Object.freeze(result.data);
}
