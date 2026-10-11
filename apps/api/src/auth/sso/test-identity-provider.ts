/** TEST ONLY: an in-process identity provider; never import this signer in production. */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { signXml } from "@node-saml/node-saml/lib/xml.js";
import type { SignatureAlgorithm } from "@node-saml/node-saml";
import type { SamlConnection } from "./saml.js";

export interface TestResponseOptions {
  connection: SamlConnection;
  requestId?: string;
  assertionId?: string;
  subject?: string;
  email?: string;
  groups?: readonly string[];
  issuer?: string;
  audience?: string;
  recipient?: string;
  issueInstant?: string;
  notBefore?: string | null;
  notOnOrAfter?: string | null;
  confirmationNotOnOrAfter?: string;
  confirmationRequestId?: string | null;
  /** Test-only: undefined keeps the bearer method; null omits the attribute; any other string is used verbatim. */
  confirmationMethod?: string | null;
  signAssertion?: boolean;
  signResponse?: boolean;
  assertionSignatureAlgorithm?: SignatureAlgorithm;
  assertionDigestAlgorithm?: string;
  responseSignatureAlgorithm?: SignatureAlgorithm;
  responseDigestAlgorithm?: string;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function generateTestIdentityProvider(): { idpCert: string; response(options: TestResponseOptions): string } {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const idpCert = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    idpCert,
    response(options) {
      const now = Date.now();
      const attribute = (name: string, value: string | null | undefined) => value == null ? "" : ` ${name}="${escapeXml(value)}"`;
      const notBefore = options.notBefore === undefined ? new Date(now - 60_000).toISOString() : options.notBefore;
      const notOnOrAfter = options.notOnOrAfter === undefined ? new Date(now + 300_000).toISOString() : options.notOnOrAfter;
      const issuer = escapeXml(options.issuer ?? options.connection.idpEntityId);
      const instant = escapeXml(options.issueInstant ?? new Date(now).toISOString());
      let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${instant}"${attribute("InResponseTo", options.requestId)} Destination="${escapeXml(options.connection.callbackUrl)}">
        <saml:Issuer>${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
        <saml:Assertion ID="${escapeXml(options.assertionId ?? `_${randomUUID()}`)}" Version="2.0" IssueInstant="${instant}">
          <saml:Issuer>${issuer}</saml:Issuer>
          <saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${escapeXml(options.subject ?? "synthetic-subject")}</saml:NameID>
            <saml:SubjectConfirmation${attribute("Method", options.confirmationMethod === undefined ? "urn:oasis:names:tc:SAML:2.0:cm:bearer" : options.confirmationMethod)}><saml:SubjectConfirmationData Recipient="${escapeXml(options.recipient ?? options.connection.callbackUrl)}"${attribute("InResponseTo", options.confirmationRequestId === undefined ? options.requestId : options.confirmationRequestId)} NotOnOrAfter="${escapeXml(options.confirmationNotOnOrAfter ?? new Date(now + 300_000).toISOString())}"/></saml:SubjectConfirmation>
          </saml:Subject>
          <saml:Conditions${attribute("NotBefore", notBefore)}${attribute("NotOnOrAfter", notOnOrAfter)}><saml:AudienceRestriction><saml:Audience>${escapeXml(options.audience ?? options.connection.spEntityId)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
          <saml:AuthnStatement AuthnInstant="${instant}" SessionIndex="synthetic-session"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>
          <saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${escapeXml(options.email ?? "operative@synthetic.invalid")}</saml:AttributeValue></saml:Attribute>${options.groups?.length ? `<saml:Attribute Name="groups">${options.groups.map((group) => `<saml:AttributeValue>${escapeXml(group)}</saml:AttributeValue>`).join("")}</saml:Attribute>` : ""}</saml:AttributeStatement>
        </saml:Assertion></samlp:Response>`;
      const assertion = "//*[local-name(.)='Assertion']";
      const response = "/*[local-name(.)='Response']";
      if (options.signAssertion !== false) xml = signXml(xml, assertion, { reference: `${assertion}/*[local-name(.)='Issuer']`, action: "after" }, {
        privateKey, signatureAlgorithm: options.assertionSignatureAlgorithm ?? "sha256", digestAlgorithm: options.assertionDigestAlgorithm ?? "sha256",
      });
      if (options.signResponse !== false) xml = signXml(xml, response, { reference: `${response}/*[local-name(.)='Issuer']`, action: "after" }, {
        privateKey, signatureAlgorithm: options.responseSignatureAlgorithm ?? "sha256", digestAlgorithm: options.responseDigestAlgorithm ?? "sha256",
      });
      return Buffer.from(xml).toString("base64");
    },
  };
}
