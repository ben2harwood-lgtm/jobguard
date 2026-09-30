"use client";

import { useEffect, useSyncExternalStore } from "react";

/** One synchronous command owner for the job's materials → supplier-check flow.
 * This is UI concurrency control; server authorization/revision checks remain authoritative.
 */
export function createMaterialsCommand() {
  let pending = false;
  let generation = 0;
  const listeners = new Set<() => void>();
  const readers = new Set<() => Promise<void>>();
  const reads = new Map<string, number>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    isBusy: () => pending,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    register(reader: () => Promise<void>) { readers.add(reader); return () => { readers.delete(reader); }; },
    async read<T>(key: string, query: () => Promise<T>, apply: (value: T) => void, unavailable?: () => void) {
      const atGeneration = generation;
      const ticket = (reads.get(key) ?? 0) + 1;
      reads.set(key, ticket);
      try {
        const value = await query();
        if (atGeneration === generation && reads.get(key) === ticket) apply(value);
      } catch (cause) {
        if (atGeneration !== generation || reads.get(key) !== ticket) return;
        unavailable?.();
        throw cause;
      }
    },
    async run(action: () => Promise<void>) {
      // Acquire before the first await, including before React renders disabled controls.
      if (pending) return;
      pending = true;
      generation += 1;
      notify();
      try {
        let failure: unknown;
        let failed = false;
        try { await action(); } catch (cause) { failure = cause; failed = true; }
        // Keep every dependent action locked through authoritative projection refreshes.
        const results = await Promise.allSettled([...readers].map(reader => reader()));
        if (failed) throw failure;
        for (const result of results) if (result.status === "rejected") throw result.reason;
      } finally {
        pending = false;
        notify();
      }
    },
  };
}

const commands = new Map<string, ReturnType<typeof createMaterialsCommand>>();
export function materialsCommandFor(jobId: string) {
  let command = commands.get(jobId);
  if (!command) { command = createMaterialsCommand(); commands.set(jobId, command); }
  return command;
}

export function useMaterialsCommand(jobId: string, load: () => Promise<void>) {
  const command = materialsCommandFor(jobId);
  const busy = useSyncExternalStore(command.subscribe, command.isBusy, () => false);
  useEffect(() => command.register(load), [command, load]);
  return { busy, run: command.run };
}
