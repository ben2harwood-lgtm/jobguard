import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import next from "next";

const [hostname, port, key, cert] = process.argv.slice(2);
const app = next({ dev: false, hostname, port: Number(port), quiet: true });
await app.prepare();
const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, app.getRequestHandler());
server.listen(Number(port), "127.0.0.1", () => process.send?.("ready"));
