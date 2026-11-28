import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const owners = {
  "worker.heartbeat_missed": "QUEUE_OPERATOR",
  "worker.queue_unavailable": "QUEUE_OPERATOR",
  "worker.queue_backlog": "QUEUE_OPERATOR",
  "worker.queue_failed": "QUEUE_OPERATOR",
};

export function workerAlerts(status) {
  if (status?.queueAvailable === false) return ["worker.heartbeat_missed", "worker.queue_unavailable"];
  if (status?.queueAvailable !== true ||
      !["heartbeat", "backlog", "failed"].every(key => typeof status[key] === "boolean")) {
    return ["worker.heartbeat_missed"];
  }
  return [
    ...(!status.heartbeat ? ["worker.heartbeat_missed"] : []),
    ...(status.backlog ? ["worker.queue_backlog"] : []),
    ...(status.failed ? ["worker.queue_failed"] : []),
  ];
}

export async function probeWorker(url) {
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3_000) });
    const body = await response.json();
    if ((response.status === 200 && body?.heartbeat === true) ||
        (response.status === 503 && body?.heartbeat === false)) return workerAlerts(body);
    return workerAlerts();
  } catch {
    return workerAlerts();
  }
}

async function monitor() {
  const url = new URL(process.env.PILOT_WORKER_HEALTH_URL);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/healthz" || url.search || url.hash) throw new Error("PILOT_MONITOR_CONFIG_REFUSED");
  let active = new Set();
  while (true) {
    const signals = await probeWorker(url);
    for (const signal of signals) {
      if (!active.has(signal)) console.log(JSON.stringify({ signal, ownerRole: owners[signal], state: "firing" }));
    }
    for (const signal of active) {
      if (!signals.includes(signal)) console.log(JSON.stringify({ signal, ownerRole: owners[signal], state: "cleared" }));
    }
    active = new Set(signals);
    await delay(5_000);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await monitor(); }
  catch { console.error("PILOT_MONITOR_START_FAILED"); process.exitCode = 1; }
}
