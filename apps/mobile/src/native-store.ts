import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { openCipherStore } from "./store";
/** Synthetic single-user probe only. No credentials are accepted or persisted here. */
export async function openNativeStore() {
 const keyName = "jobguard.synthetic.m31.key.v1";
 const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
 let key = await SecureStore.getItemAsync(keyName, options);
 if (!key) {
  key = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(keyName, key, options);
 }
 return openCipherStore(await SQLite.openDatabaseAsync("m31-synthetic.db"), key);
}
