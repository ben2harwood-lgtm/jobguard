import { Socket } from "node:net";
import { host, ports } from "./settings.mjs";

const allowedPorts = new Set(Object.values(ports));
const connect = Socket.prototype.connect;

// pg, HTTP(S), undici and the AWS SDK all open TCP sockets through here.
// Use numeric loopback to avoid DNS, host aliases and proxy resolution.
Socket.prototype.connect = function (...args) {
  const input = Array.isArray(args[0]) ? args[0] : args;
  const target = typeof input[0] === "object" ? input[0] : { port: input[0], host: input[1] };
  if (!target || target.path || target.host !== host || !allowedPorts.has(Number(target.port))) {
    // Use the socket's normal asynchronous error path so HTTP and TLS clients
    // can handle the refusal as a connection failure.
    const error = Object.assign(new Error("V2 blocked an outbound connection"), { code: "V2_OUTBOUND_BLOCKED" });
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return Reflect.apply(connect, this, args);
};
