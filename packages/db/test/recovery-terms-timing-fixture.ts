import type { Pool, PoolClient } from "pg";

/** Intercept transaction COMMIT, retaining native pool.query/connect(callback). */
export function beforeTermsCommitPool(pool: Pool, beforeCommit: (client: PoolClient) => Promise<void>): Pool {
 return new Proxy(pool, {
  get(target, key) {
   if (key === "connect") return async () => {
    const client = await target.connect();
    return new Proxy(client, {
     get(connection, property) {
      if (property === "query") return async (...args: unknown[]) => {
       if (args[0] === "COMMIT") await beforeCommit(connection);
       return Reflect.apply(connection.query, connection, args);
      };
      const value = Reflect.get(connection, property);
      return typeof value === "function" ? value.bind(connection) : value;
     },
    });
   };
   // Pool.query must keep `this` as the real pool: it uses connect(callback),
   // whereas the transaction interceptor above deliberately returns a Promise.
   const value = Reflect.get(target, key);
   return typeof value === "function" ? value.bind(target) : value;
  },
 });
}
