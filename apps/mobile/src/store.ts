/** Native implementation must verify SQLCipher before reading or creating application tables. */
export interface EncryptedStore {
 readonly encryption: "sqlcipher";
 read(): Promise<string | null>;
 write(value: string): Promise<void>;
 close(): Promise<void>;
}
export interface CipherDatabase {
 execAsync(sql: string): Promise<void>;
 getFirstAsync<T>(sql: string): Promise<T | null>;
 runAsync(sql: string, ...parameters: string[]): Promise<unknown>;
 closeAsync(): Promise<void>;
}
export async function openCipherStore(db: CipherDatabase, key: string): Promise<EncryptedStore> {
 try {
  if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("ENCRYPTION_KEY_INVALID");
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
  if (!cipher?.cipher_version) throw new Error("SQLCIPHER_REQUIRED");
  // Reading the catalog forces wrong-key/corruption errors before creating application data.
  await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
  const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if (!version || ![0, 1].includes(version.user_version)) throw new Error("LOCAL_SCHEMA_UNSUPPORTED");
  await db.execAsync("BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS native_probe (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL); PRAGMA user_version=1; COMMIT;");
  return { encryption: "sqlcipher", read: async () => (await db.getFirstAsync<{ payload: string }>("SELECT payload FROM native_probe WHERE id=1"))?.payload ?? null,
   write: async value => { await db.runAsync("INSERT INTO native_probe(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", value); },
   close: () => db.closeAsync() };
 } catch (error) { await db.closeAsync(); throw error; }
}
