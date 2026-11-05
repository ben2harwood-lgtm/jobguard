import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { mobilePartitionV1 } from "@jobguard/core";
import { openCipherStore } from "./store";
import type { Partition, PartitionResources, SecureVault } from "./lifecycle-contracts";
/** No source session, mobile bearer or data-encryption key enters general SQLite or logs. */
const keyOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const nativeVault: SecureVault = {
 get: key => SecureStore.getItemAsync(key, keyOptions),
 set: (key, value) => SecureStore.setItemAsync(key, value, keyOptions),
 remove: key => SecureStore.deleteItemAsync(key, keyOptions),
};
export async function nativePartitionKey(raw: Partition): Promise<string> {
 const p = mobilePartitionV1.parse(raw);
 return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,
  JSON.stringify([p.userId, p.tenantId, p.membershipId, p.mobileSessionId, p.deviceInstanceId]));
}
export function nativePartitionResources(vault: SecureVault = nativeVault): PartitionResources {
 return {
  open: async (p, create) => {
   const digest = await nativePartitionKey(p), keyName = `m32.dbkey.${digest}`;
   let key = await vault.get(keyName);
   if (!key) {
    if (!create) throw new Error("ENCRYPTION_KEY_MISSING");
    key = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, "0")).join("");
    await vault.set(keyName, key);
   }
   // No SQLite opening before the secure key is available. Key and cipher checks precede application data.
   return openCipherStore(await SQLite.openDatabaseAsync(`m32-${digest}.db`), key);
  },
  destroy: async p => {
   const digest = await nativePartitionKey(p);
   await SQLite.deleteDatabaseAsync(`m32-${digest}.db`);
   await vault.remove(`m32.dbkey.${digest}`);
  },
 };
}
/** Native offline clock approval remains D08 work. Never label a device clock trusted_fixture. */
export const nativeUnverifiedClock = () => ({ status: "unverified" as const, nowMs: Date.now() });

// Explicit dependency injection only; no default account, credential, policy or live endpoint.
export async function createNativeSyntheticClient(provider: import("./lifecycle-contracts").MobileAuthProvider,
 policy: unknown, deviceInstanceId: string, enabled: boolean) {
 if (!await SecureStore.isAvailableAsync()) throw new Error("SECURE_STORAGE_REQUIRED");
 const { MobileClient } = await import("./lifecycle");
 return new MobileClient(provider, nativeVault, nativePartitionResources(), { enabled, environment: "synthetic_demo", policy,
  uuid: () => Crypto.randomUUID(), deviceInstanceId, clock: nativeUnverifiedClock, partitionKey: nativePartitionKey });
}
