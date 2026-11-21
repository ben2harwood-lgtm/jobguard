import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const bucket = "/jobguard-pilot-fixture";
const object = bucket + "/pilot_no_charge/fixture/original";
const accessId = process.env.FIXTURE_STORAGE_ID;
if (!/^[a-f0-9]{48}$/u.test(accessId ?? "")) throw new Error("FIXTURE_INPUT_REFUSED");

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://objects");
    // This isolated fixture checks the access ID. The selected store implements signing and IAM.
    const id = url.searchParams.get("X-Amz-Credential")?.split("/")[0] ??
      request.headers.authorization?.match(/\bCredential=([^/]+)\//u)?.[1];
    if (id !== accessId) return response.writeHead(403).end();
    if (request.method === "GET" && [bucket, bucket + "/"].includes(url.pathname) && url.searchParams.has("versioning")) {
      return response.writeHead(200, { "Content-Type": "application/xml" }).end(
        '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
      );
    }
    if (url.pathname !== object) return response.writeHead(404).end();
    if (request.method === "PUT") {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 1024) return response.writeHead(413).end();
        chunks.push(chunk);
      }
      const version = randomUUID();
      await writeFile("/fixture-objects/" + version, Buffer.concat(chunks), { flag: "wx", mode: 0o600 });
      return response.writeHead(200, { "x-amz-version-id": version }).end();
    }

    const version = url.searchParams.get("versionId") ?? "";
    if (!/^[0-9a-f-]{36}$/u.test(version) || !["GET", "HEAD"].includes(request.method)) {
      return response.writeHead(404).end();
    }
    const bytes = await readFile("/fixture-objects/" + version);
    return response.writeHead(200, {
      "x-amz-version-id": version,
      "Content-Length": bytes.length,
      "Content-Type": "text/plain",
    }).end(request.method === "GET" ? bytes : undefined);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
  }
}).listen(9000, "0.0.0.0");
