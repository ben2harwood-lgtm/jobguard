import { SAML, ValidateInResponseTo, type CacheProvider } from "@node-saml/node-saml";
import { z } from "zod";

export interface SamlConnection {
  readonly id: string;
  readonly tenantId: string;
  readonly idpEntityId: string;
  readonly spEntityId: string;
  readonly callbackUrl: string;
  readonly entryPoint: string;
  readonly idpCert: string;
}

const samlIdentityV1 = z.object({
  assertionId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(256),
  subject: z.string().min(1).max(256),
  email: z.string().email().max(320),
  groups: z.array(z.string().min(1).max(256)).max(100),
}).strict();
export type SamlIdentity = z.infer<typeof samlIdentityV1>;

export class SamlValidationError extends Error {
  readonly code = "SAML_REFUSED";
  constructor() { super("SAML_REFUSED"); this.name = "SamlValidationError"; }
}

/** Claim inspection only, on the library's signature-verified parsed output. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SamlValidationError();
  return value as Record<string, unknown>;
}
function single(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) throw new SamlValidationError();
  return record(value[0]);
}
function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new SamlValidationError();
  return value;
}

/** SAML library validates parsing/signatures/audience/time; this adapter may only add refusals. */
export class SamlAdapter {
  private readonly saml: SAML;
  constructor(private readonly connection: SamlConnection, cacheProvider: CacheProvider) {
    this.saml = new SAML({
      callbackUrl: connection.callbackUrl,
      entryPoint: connection.entryPoint,
      issuer: connection.spEntityId,
      idpIssuer: connection.idpEntityId,
      idpCert: connection.idpCert,
      audience: connection.spEntityId,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      validateInResponseTo: ValidateInResponseTo.always,
      acceptedClockSkewMs: 30_000,
      maxAssertionAgeMs: 600_000,
      requestIdExpirationPeriodMs: 600_000,
      signatureAlgorithm: "sha256",
      digestAlgorithm: "sha256",
      cacheProvider,
    });
  }

  async start(): Promise<string> {
    try { return await this.saml.getAuthorizeUrlAsync("", undefined, {}); }
    catch { throw new SamlValidationError(); }
  }

  async validate(SAMLResponse: string): Promise<SamlIdentity> {
    try {
      const { profile, loggedOut } = await this.saml.validatePostResponseAsync({ SAMLResponse });
      if (loggedOut || !profile || profile.issuer !== this.connection.idpEntityId) throw new SamlValidationError();
      if (!profile.getAssertion || !profile.getAssertionXml || !profile.getSamlResponseXml) throw new SamlValidationError();
      // Inspect already-verified text only to deny SHA-1 and entity-obscured algorithm names.
      // No XML parsing/canonicalisation or signature verification here; ambiguous encodings fail closed.
      const weakAlgorithm = /\bAlgorithm\s*=\s*["'][^"']*(?:sha-?1|&)[^"']*["']/i;
      if (weakAlgorithm.test(profile.getAssertionXml()) || weakAlgorithm.test(profile.getSamlResponseXml())) throw new SamlValidationError();
      const assertion = record(record(profile.getAssertion()).Assertion);
      const assertionAttributes = record(assertion.$);
      const conditions = record(single(assertion.Conditions).$);
      requiredString(conditions.NotBefore);
      requiredString(conditions.NotOnOrAfter);
      // Accept one bearer confirmation only; avoid ambiguity between library-selected and inspected confirmations.
      const confirmation = single(single(assertion.Subject).SubjectConfirmation);
      // Bearer carries no key-possession proof to check, so it is the only method accepted; missing, unknown and holder-of-key are refused.
      if (record(confirmation.$).Method !== "urn:oasis:names:tc:SAML:2.0:cm:bearer") throw new SamlValidationError();
      const confirmationData = record(single(confirmation.SubjectConfirmationData).$);
      if (confirmationData.Recipient !== this.connection.callbackUrl) throw new SamlValidationError();
      const requestId = requiredString(confirmationData.InResponseTo);
      if (requestId !== profile.inResponseTo) throw new SamlValidationError();
      const groups = profile.groups === undefined ? [] : typeof profile.groups === "string" ? [profile.groups] : profile.groups;
      return samlIdentityV1.parse({
        assertionId: requiredString(assertionAttributes.ID), requestId,
        subject: profile.nameID, email: profile.email, groups,
      });
    } catch { throw new SamlValidationError(); }
  }
}
