import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeTsaTimestampAdapter } from "./timestamp.js";
const dir = mkdtempSync(join(tmpdir(), "jobguard-tsa-fixture-"));
const run = (...args: string[]) => execFileSync("openssl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const policyOption = run("version").startsWith("LibreSSL") ? "-policy" : "-tspolicy";
let certificatePem: string;
let caCertificatePem: string;
let signerSha256: string;
const request = { schemaVersion: 1, synthetic: true, subject: "manifest", imprint: "ab".repeat(32) };
function respond(query: Uint8Array, policy = "1.2.3.4", alternateSigner = false) {
  writeFileSync(join(dir, "query.tsq"), query);
  run("ts", "-reply", "-config", join(dir, "tsa.cnf"), "-queryfile", join(dir, "query.tsq"),
    policyOption, policy, ...(alternateSigner ? ["-signer", join(dir, "other.pem"), "-inkey", join(dir, "other.key")] : []), "-out", join(dir, "response.tsr"));
  return new Uint8Array(readFileSync(join(dir, "response.tsr")));
}
function adapter(respondFn = async (q: Uint8Array) => respond(q)) {
  return new FakeTsaTimestampAdapter({ enabled: true, certificatePem, caCertificatePem, signerSha256, policyOid: "1.2.3.4", respond: respondFn });
}
beforeAll(() => {
  writeFileSync(join(dir, "cert.cnf"), `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Synthetic JobGuard TSA\n[ext]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n`);
  writeFileSync(join(dir, "ca.cnf"), `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Synthetic Root\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`);
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-config", join(dir, "ca.cnf"),
    "-keyout", join(dir, "ca.key"), "-out", join(dir, "ca.pem"));
  caCertificatePem = readFileSync(join(dir, "ca.pem"), "utf8");
  run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-config", join(dir, "cert.cnf"),
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.csr"));
  run("x509", "-req", "-in", join(dir, "cert.csr"), "-CA", join(dir, "ca.pem"), "-CAkey", join(dir, "ca.key"),
    "-set_serial", "1", "-days", "2", "-extfile", join(dir, "cert.cnf"), "-extensions", "ext", "-out", join(dir, "cert.pem"));
  run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-config", join(dir, "cert.cnf"),
    "-keyout", join(dir, "other.key"), "-out", join(dir, "other.csr"));
  run("x509", "-req", "-in", join(dir, "other.csr"), "-CA", join(dir, "ca.pem"), "-CAkey", join(dir, "ca.key"),
    "-set_serial", "2", "-days", "2", "-extfile", join(dir, "cert.cnf"), "-extensions", "ext", "-out", join(dir, "other.pem"));
  certificatePem = readFileSync(join(dir, "cert.pem"), "utf8");
  signerSha256 = new X509Certificate(certificatePem).fingerprint256.replaceAll(":", "").toLowerCase();
  writeFileSync(join(dir, "serial"), "01\n");
  writeFileSync(join(dir, "tsa.cnf"), `[tsa]\ndefault_tsa=local\n[local]\nserial=${dir}/serial\ncrypto_device=builtin\nsigner_cert=${dir}/cert.pem\nsigner_key=${dir}/key.pem\nsigner_digest=sha256\ndefault_policy=1.2.3.4\nother_policies=1.2.3.5\ndigests=sha256\naccuracy=secs:1\nordering=yes\ntsa_name=yes\ness_cert_id_chain=no\n`);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
describe("RFC-3161 against a local fake TSA (no network)", () => {
  it("verifies actual signed DER and returns token, query and pinned verification material", async () => {
    const result = await adapter().anchor(request);
    expect(result.status).toBe("anchored");
    if (result.status !== "anchored") return;
    expect(result.token.length).toBeGreaterThan(100);
    expect(result.query.length).toBeGreaterThan(32);
    expect(result.signerSha256).toBe(signerSha256);
    expect(result.policyOid).toBe("1.2.3.4");
    expect(result.claim).toBe("synthetic_integrity_and_existence_only");
  });
  it("marks service failure pending", async () => {
    expect(await adapter(async () => { throw new Error("unavailable"); }).anchor(request)).toEqual({ status: "pending", reason: "service_unavailable" });
  });
  it("rejects replay with another nonce", async () => {
    let token: Uint8Array | undefined;
    const tsa = adapter(async q => token ??= respond(q));
    expect((await tsa.anchor(request)).status).toBe("anchored");
    expect((await tsa.anchor(request)).status).toBe("pending");
  });
  it("rejects a different imprint, even with a valid signature", async () => {
    const tsa = adapter(async q => {
      const changed = Buffer.from(q);
      const offset = changed.indexOf(Buffer.from(request.imprint, "hex"));
      expect(offset).toBeGreaterThan(0);
      changed.fill(0xcd, offset, offset + 32); // Preserve the original nonce; change only the imprint.
      return respond(changed);
    });
    expect((await tsa.anchor(request)).status).toBe("pending");
  });
  it("rejects a wrong policy, corrupt signature and untrusted signer pin", async () => {
    expect((await adapter(async q => respond(q, "1.2.3.5")).anchor(request)).status).toBe("pending");
    expect((await adapter(async q => { const token = respond(q); token[token.length - 1] = (token[token.length - 1] ?? 0) ^ 1; return token; }).anchor(request)).status).toBe("pending");
    await expect(new FakeTsaTimestampAdapter({ enabled: true, certificatePem, caCertificatePem, signerSha256: "00".repeat(32), policyOid: "1.2.3.4", respond: async q => respond(q) }).anchor(request)).rejects.toThrow("INVALID_INPUT");
  });
  it("rejects a different valid TSA signer issued by the same trusted fake CA", async () => {
    expect((await adapter(async q => respond(q, "1.2.3.4", true)).anchor(request)).status).toBe("pending");
  });
  it("rejects stale timestamps and malformed responses", async () => {
    expect((await adapter().anchor(request, new Date(Date.now() + 10 * 60 * 1000))).status).toBe("pending");
    expect((await adapter(async () => new Uint8Array([1, 2, 3])).anchor(request)).status).toBe("pending");
  });
  it("refuses real data and defaults off before contacting the fake TSA", async () => {
    await expect(adapter().anchor({ ...request, synthetic: false })).rejects.toThrow("INVALID_INPUT");
    await expect(adapter().anchor({ ...request, imprint: "bad" })).rejects.toThrow("INVALID_INPUT");
    await expect(new FakeTsaTimestampAdapter({ certificatePem, caCertificatePem, signerSha256, policyOid: "1.2.3.4", respond: async () => { throw new Error("must not run"); } }).anchor(request)).rejects.toThrow("DARK_ONLY");
  });
});
