import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;
type ProofTable = { names: string[]; typed: Record<string, string>; key: string[]; rows: Record<string, string> };
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const tableIdent = (table: string) => {
  const parts = table.split(".");
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error(`Schema-qualified table required: ${table}`);
  return parts.map(ident).join(".");
};

export async function proofRows(db: Queryable, table: string, names: string[], key: string[]) {
  const found = (await db.query(`SELECT identity,bytes FROM (SELECT (SELECT row_to_json(k)::text FROM (SELECT ${key.map(name => `t.${ident(name)}`).join(",")}) k) AS identity,
    (SELECT row_to_json(s)::text FROM (SELECT ${names.map(name => `t.${ident(name)}`).join(",")}) s) AS bytes FROM ${tableIdent(table)} t) x ORDER BY identity COLLATE "C"`)).rows;
  return Object.fromEntries(found.map(row => [row.identity as string, row.bytes as string]));
}

export async function proofColumns(db: Queryable, table: string) {
  return (await db.query(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
    WHERE (a.attrelid=$1::regclass) AND (a.attnum>0) AND (NOT a.attisdropped) ORDER BY a.attnum`, [tableIdent(table)])).rows as { name: string; type: string }[];
}

export async function proofBefore(db: Queryable, tables: string[]) {
  const proof: Record<string, ProofTable> = {};
  for (const table of tables) {
    const columns = await proofColumns(db, table);
    const key = (await db.query(`SELECT a.attname::text AS name FROM pg_index i JOIN pg_attribute a ON (a.attrelid=i.indrelid) AND (a.attnum=ANY(i.indkey))
      WHERE (i.indrelid=$1::regclass) AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`, [tableIdent(table)])).rows.map(row => row.name as string);
    if (!key.length) throw new Error(`${table}: no primary key`);
    const names = columns.map(column => column.name);
    proof[table] = { names, typed: Object.fromEntries(columns.map(column => [column.name, column.type])), key, rows: await proofRows(db, table, names, key) };
  }
  return proof;
}

export async function proofDifferences(db: Queryable, proof: Record<string, ProofTable>) {
  const rows: string[] = [], types: string[] = [];
  for (const [table, was] of Object.entries(proof)) {
    const now = new Map((await proofColumns(db, table)).map(column => [column.name, column.type]));
    for (const name of was.names) if (now.get(name) !== was.typed[name]) types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name) ?? "(gone)"}`);
    if (was.names.some(name => !now.has(name))) continue;
    const live = await proofRows(db, table, was.names, was.key);
    for (const [identity, bytes] of Object.entries(was.rows)) {
      if (!(identity in live)) rows.push(`${table} ${identity}: missing`);
      else if (live[identity] !== bytes) rows.push(`${table} ${identity}: changed`);
    }
  }
  return { rows, types };
}

export async function rolledBack<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); return await work(client); }
  finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
}

export async function scratchReplaceFunction(db: Queryable, signature: string) {
  const read = async () => (await db.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [signature])).rows[0]!.definition as string;
  const definition = await read();
  if (!definition.includes("$function$")) throw new Error(`${signature}: expected $function$ delimiter`);
  await db.query(definition.replace("$function$", "$function$/* mo4 scratch */"));
  return (await read()).includes("mo4 scratch");
}

/** Union only approved catalogue rows, preserving earlier metadata and the database's final ordering. */
export function catalogueAdditions<T>(previous: T[], added: T[], live: T[]): T[] {
  const positions = new Map(live.map((row, index) => [JSON.stringify(row), index]));
  const position = (row: T) => positions.get(JSON.stringify(row)) ?? -1;
  return [...previous, ...added].sort((a, b) => position(a) - position(b));
}
