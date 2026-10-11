import type { Pool, PoolClient } from "pg";

// Observes, in real PostgreSQL, which locks a command's transactions hold after every statement they run. It is what makes the
// "no business lock after the audit append" rule (AGENTS.md 5.4, BUILD_PLAN C5) executable instead of a reading of source text.
//
// A recording wraps the pool a repository was built with. The wrapper is transparent; while a recording is active, after each
// statement of each transaction it asks a separate superuser connection what that backend holds:
//   - advisory locks and table locks, from pg_locks;
//   - row locks on rows that already exist, by probing every row of each locked table with SELECT ... FOR <mode> SKIP LOCKED in
//     all four row-lock modes (a row skipped by a weaker probe is locked more strongly). Rows the transaction inserted itself are
//     invisible to other sessions and cannot be contended, so they are correctly absent.
// The footprint (key -> strength) after each statement gives the order locks were taken in.

export type Footprint = { rows: Map<string, number>; advisory: Set<string>; tableModes: Map<string, string[]> };
export type ObservedStatement = { sql: string; footprint: Footprint };
export type ObservedTransaction = { pid: number; statements: ObservedStatement[]; outcome: "commit" | "rollback" | "open" };

const ROW_MODES = ["UPDATE", "NO KEY UPDATE", "SHARE", "KEY SHARE"] as const;
const SCHEMAS = ["app", "audit_control", "control_plane", "identity"];
const STRONG_TABLE_MODES = ["ShareUpdateExclusiveLock", "ShareLock", "ShareRowExclusiveLock", "ExclusiveLock", "AccessExclusiveLock"];
export const rowStrengthName = (rank: number) => ["none", "KEY SHARE", "SHARE", "NO KEY UPDATE", "UPDATE"][rank] ?? String(rank);

const first = (sql: string) => sql.trim().replace(/;$/u, "").toUpperCase();

async function footprintOf(observer: Pool, pid: number): Promise<Footprint> {
  const client = await observer.connect();
  try {
    const locks = await client.query<{ rel: string; mode: string }>(
      `SELECT n.nspname||'.'||c.relname AS rel, l.mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE l.pid=$1 AND l.granted AND l.locktype='relation' AND c.relkind='r' AND n.nspname=ANY($2)`, [pid, SCHEMAS]);
    const advisoryRows = await client.query<{ k: string }>(
      "SELECT classid::text||':'||objid::text||':'||objsubid::text AS k FROM pg_locks WHERE pid=$1 AND granted AND locktype='advisory'", [pid]);
    const tableModes = new Map<string, string[]>();
    for (const lock of locks.rows) tableModes.set(lock.rel, [...(tableModes.get(lock.rel) ?? []), lock.mode]);
    const rows = new Map<string, number>();
    const tables = [...tableModes.keys()];
    if (tables.length) {
      // Quoted identifiers come from pg_class, never from a caller. One round trip: a consistent snapshot, then roll back.
      const quote = (qualified: string) => qualified.split(".").map(part => `"${part.replace(/"/gu, '""')}"`).join(".");
      const statements = ["BEGIN ISOLATION LEVEL REPEATABLE READ"];
      for (const table of tables) {
        statements.push(`SELECT '${table}' AS t, 'all' AS p, ctid::text AS c FROM ${quote(table)}`);
        for (const mode of ROW_MODES) statements.push(`SELECT '${table}' AS t, '${mode}' AS p, ctid::text AS c FROM ${quote(table)} FOR ${mode} SKIP LOCKED`);
      }
      statements.push("ROLLBACK");
      const results = (await client.query(statements.join(";\n"))) as unknown as Array<{ rows: Array<{ t: string; p: string; c: string }> }>;
      const seen = new Map<string, Map<string, Set<string>>>();
      for (const result of results) for (const row of result.rows ?? []) {
        const byProbe = seen.get(row.t) ?? new Map<string, Set<string>>(); seen.set(row.t, byProbe);
        const ctids = byProbe.get(row.p) ?? new Set<string>(); byProbe.set(row.p, ctids); ctids.add(row.c);
      }
      for (const [table, byProbe] of seen) for (const ctid of byProbe.get("all") ?? []) {
        // A probe that did not return a visible row was blocked by a lock somebody holds on it; the strongest probe blocked tells the strength.
        const rank = ROW_MODES.filter(mode => !(byProbe.get(mode)?.has(ctid))).length;
        if (rank > 0) rows.set(`${table}#${ctid}`, rank);
      }
    }
    return { rows, advisory: new Set(advisoryRows.rows.map(row => row.k)), tableModes };
  } finally { client.release(); }
}

/** A pool that behaves exactly like `pool` until `record` is called. */
export class ObservedPool {
  readonly pool: Pool;
  private active: ObservedTransaction[] | null = null;
  constructor(private readonly real: Pool, private readonly observer: Pool) {
    const self = this;
    this.pool = new Proxy(real, {
      get(target, property) {
        if (property === "connect") return async (...args: unknown[]) => {
          const client = await (target.connect as (...a: unknown[]) => Promise<PoolClient>)(...args);
          return self.wrap(client);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Pool;
  }
  private wrap(client: PoolClient): PoolClient {
    const self = this;
    let pid: number | undefined, current: ObservedTransaction | undefined;
    return new Proxy(client, {
      get(target, property) {
        if (property !== "query") { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; }
        return async (...args: unknown[]) => {
          const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text ?? "";
          const result = await (target.query as (...a: unknown[]) => Promise<unknown>)(...args);
          const recording = self.active;
          if (!recording) return result;
          if (pid === undefined) pid = Number((await (target.query as (s: string) => Promise<{ rows: Array<{ pid: number }> }>)("SELECT pg_backend_pid() AS pid")).rows[0]!.pid);
          const word = first(text);
          if (word === "BEGIN") { current = { pid, statements: [], outcome: "open" }; recording.push(current); }
          else if (word === "COMMIT" || word === "ROLLBACK") { if (current) current.outcome = word === "COMMIT" ? "commit" : "rollback"; current = undefined; }
          else if (current) current.statements.push({ sql: text.replace(/\s+/gu, " ").trim().slice(0, 240), footprint: await footprintOf(self.observer, pid) });
          return result;
        };
      },
    });
  }
  /** Runs `work` and returns every transaction that ran while it did (run commands one at a time). */
  async record<T>(work: () => Promise<T>): Promise<{ value: T; transactions: ObservedTransaction[] }> {
    if (this.active) throw new Error("a recording is already active");
    const transactions: ObservedTransaction[] = []; this.active = transactions;
    try { return { value: await work(), transactions }; } finally { this.active = null; }
  }
}

export type Ownership = { mutable: Set<string> };

/** Tables that something can lock FOR UPDATE: the runtime role holds an UPDATE grant, or a SECURITY DEFINER routine mentions the table
 * in a body that updates, deletes or locks FOR UPDATE. Every other table is append-only, so a foreign-key KEY SHARE lock on one of
 * its rows has nothing that could ever conflict with it (SELECT ... FOR UPDATE needs the UPDATE privilege). Deliberately generous: a
 * table is treated as mutable when in doubt, which can only make the test stricter. */
export async function mutableTables(admin: Pool): Promise<Set<string>> {
  const granted = await admin.query<{ rel: string }>(
    `SELECT n.nspname||'.'||c.relname AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND n.nspname=ANY($1) AND (has_table_privilege('jobguard_runtime',c.oid,'UPDATE') OR has_any_column_privilege('jobguard_runtime',c.oid,'UPDATE'))`, [SCHEMAS]);
  const tables = await admin.query<{ rel: string; name: string; schema: string }>(
    "SELECT n.nspname||'.'||c.relname AS rel, c.relname AS name, n.nspname AS schema FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname=ANY($1)", [SCHEMAS]);
  const routines = await admin.query<{ body: string }>(
    `SELECT lower(p.prosrc) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname=ANY($1) AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')`, [SCHEMAS]);
  const mutable = new Set(granted.rows.map(row => row.rel));
  for (const { body } of routines.rows) {
    const locksForUpdate = /\bfor\s+(no\s+key\s+)?update\b/u.test(body);
    for (const table of tables.rows) {
      // The table as a statement names it: "[schema.]table" right after UPDATE / DELETE FROM, or (in a body that locks FOR UPDATE) after FROM / JOIN.
      // A bare word such as "tenant" in a variable name or a comment is not a reference.
      const ref = `(?:${table.schema}\\.)?${table.name.toLowerCase()}`;
      if (new RegExp(`\\b(?:update\\s+(?:only\\s+)?|delete\\s+from\\s+(?:only\\s+)?)${ref}\\b`, "u").test(body)
        || (locksForUpdate && new RegExp(`\\b(?:from|join)\\s+${ref}\\b`, "u").test(body))) mutable.add(table.rel);
    }
  }
  return mutable;
}

export type LockViolation = { statement: string; locks: string[] };
const isAuditHead = (key: string) => key.startsWith("audit_control.audit_head#");
const tableOf = (key: string) => key.slice(0, key.indexOf("#"));

/** Row locks and advisory locks a statement added to the footprint, relative to the previous one: new keys, or a stronger mode. */
function added(previous: Footprint | undefined, now: Footprint): Array<{ key: string; rank: number; advisory: boolean }> {
  const out: Array<{ key: string; rank: number; advisory: boolean }> = [];
  for (const [key, rank] of now.rows) if ((previous?.rows.get(key) ?? 0) < rank) out.push({ key, rank, advisory: false });
  for (const key of now.advisory) if (!previous?.advisory.has(key)) out.push({ key, rank: 5, advisory: true });
  return out;
}

export interface OrderAnalysis {
  /** The locks the first lock-taking statement added (the first business lock). */
  firstLocks: Array<{ key: string; rank: number; advisory: boolean }>; firstStatement: string | undefined;
  /** Index of the statement that took the audit head row lock, if the transaction appended audit at all. */
  auditIndex: number | undefined;
  /** Contending locks acquired after the audit head: must be empty. */
  afterAudit: LockViolation[];
  /** Table locks stronger than ROW EXCLUSIVE anywhere in the transaction: must be empty. */
  strongTableLocks: string[];
  /** Locks acquired after the audit head that were not counted because they cannot contend (KEY SHARE on append-only rows). */
  tolerated: string[];
}

export function analyseLockOrder(transaction: ObservedTransaction, ownership: Ownership): OrderAnalysis {
  const steps = transaction.statements;
  let firstIndex = -1;
  for (let i = 0; i < steps.length; i++) if (steps[i]!.footprint.rows.size || steps[i]!.footprint.advisory.size) { firstIndex = i; break; }
  const firstLocks = firstIndex < 0 ? [] : added(undefined, steps[firstIndex]!.footprint);
  const auditIndex = steps.findIndex(step => [...step.footprint.rows.keys()].some(isAuditHead));
  const afterAudit: LockViolation[] = [], tolerated: string[] = [];
  if (auditIndex >= 0) for (let i = auditIndex + 1; i < steps.length; i++) {
    const fresh = added(steps[i - 1]!.footprint, steps[i]!.footprint).filter(lock => !isAuditHead(lock.key));
    const contending = fresh.filter(lock => lock.advisory || lock.rank >= 2 || ownership.mutable.has(tableOf(lock.key)));
    for (const lock of fresh) if (!contending.includes(lock)) tolerated.push(`${rowStrengthName(lock.rank)} ${lock.key}`);
    if (contending.length) afterAudit.push({ statement: steps[i]!.sql, locks: contending.map(lock => lock.advisory ? `advisory ${lock.key}` : `${rowStrengthName(lock.rank)} ${lock.key}`) });
  }
  const strongTableLocks = steps.flatMap(step => [...step.footprint.tableModes].flatMap(([table, modes]) => modes.filter(mode => STRONG_TABLE_MODES.includes(mode)).map(mode => `${mode} ${table}`)));
  return { firstLocks, firstStatement: firstIndex < 0 ? undefined : steps[firstIndex]!.sql, auditIndex: auditIndex < 0 ? undefined : auditIndex, afterAudit, strongTableLocks: [...new Set(strongTableLocks)], tolerated: [...new Set(tolerated)] };
}
