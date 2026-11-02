import { describe, expect, it } from "vitest";
import { ConnectorConfigurationError, parseConnectorEnvironment } from "./connector-environment.js";

const fixture = () => ({
  CONNECTOR_CONFIG_VERSION: "connector-environment.v1",
  JOBGUARD_ENV: "synthetic_demo",
  CONNECTOR_ENDPOINT_KIND: "fake",
  CONNECTOR_ENDPOINT_REF: "fixture:connector-endpoint",
  CONNECTOR_CREDENTIAL_REF: "fixture:connector-credential",
});

describe("E13-A24 independent configuration proof (application/HTTP held)", () => {
  it("accepts only explicit synthetic fixture references without granting runtime authority", () => {
    expect(parseConnectorEnvironment(fixture())).toEqual(fixture());
  });

  it("returns a frozen copy without changing its input", () => {
    const raw = fixture();
    const before = { ...raw };
    const parsed = parseConnectorEnvironment(raw);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed).not.toBe(raw);
    expect(raw).toEqual(before);
    expect(Object.isFrozen(raw)).toBe(false);
    raw.CONNECTOR_ENDPOINT_REF = "fixture:changed";
    expect(parsed.CONNECTOR_ENDPOINT_REF).toBe(before.CONNECTOR_ENDPOINT_REF);
  });

  it.each([undefined, null, {}, [], "synthetic_demo"])("fails closed for absent or invalid configuration: %j", raw => {
    expect(() => parseConnectorEnvironment(raw)).toThrow(ConnectorConfigurationError);
  });

  it.each(Object.keys(fixture()))("requires %s with no default", field => {
    const raw: Record<string, unknown> = fixture();
    delete raw[field];
    expect(() => parseConnectorEnvironment(raw)).toThrow(ConnectorConfigurationError);
  });

  it.each(["pilot_no_charge", "provider_sandbox", "production", "production_billing"])("refuses real or other deployment mode %s", mode => {
    expect(() => parseConnectorEnvironment({ ...fixture(), JOBGUARD_ENV: mode })).toThrow(ConnectorConfigurationError);
  });

  it.each(["sftp", "api", "webhook", "real"])("refuses endpoint kind %s", kind => {
    expect(() => parseConnectorEnvironment({ ...fixture(), CONNECTOR_ENDPOINT_KIND: kind })).toThrow(ConnectorConfigurationError);
  });

  it.each(["CONNECTOR_ENDPOINT_REF", "CONNECTOR_CREDENTIAL_REF"])("refuses missing, real or invalid fixture reference in %s", field => {
    for (const value of ["", " ", "https://connector.invalid", "sftp://connector.invalid", "production-reference", "fixture:", " fixture:test", "fixture:test\n", 1, null]) {
      expect(() => parseConnectorEnvironment({ ...fixture(), [field]: value })).toThrow(ConnectorConfigurationError);
    }
  });

  it.each(["tenantId", "actorId", "environment", "mode", "enabled", "allowRealEndpoints", "endpointUrl", "G5_APPROVED"])("refuses request authority field or activation flag %s", field => {
    expect(() => parseConnectorEnvironment({ ...fixture(), [field]: true })).toThrow(ConnectorConfigurationError);
  });

  it("refuses unknown configuration versions", () => {
    expect(() => parseConnectorEnvironment({ ...fixture(), CONNECTOR_CONFIG_VERSION: "connector-environment.v2" })).toThrow(ConnectorConfigurationError);
  });

  it("keeps invalid values, field names and nested source content out of diagnostics", () => {
    const canary = "c".repeat(43);
    let failure: unknown;
    try {
      parseConnectorEnvironment({ ...fixture(), [canary]: { authorization: canary }, CONNECTOR_CREDENTIAL_REF: canary });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ConnectorConfigurationError);
    expect(failure).toMatchObject({ code: "CONNECTOR_CONFIGURATION_INVALID", message: "Connector configuration is invalid or unavailable" });
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toContain(canary);
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("issues");
  });
});
