import React, { useState } from "react";
import { SafeAreaView, Text, TextInput, Button } from "react-native";
import { openNativeStore } from "./src/native-store";
import { WorkspaceScreens, type NativeWorkspaceBindings } from "./src/WorkspaceScreens";
import type { MobileClient } from "./src/lifecycle";
/** Transport is injected only by an explicitly authorized synthetic composition. No default account. */
export default function App({ client, native }: { client?: MobileClient; native?: NativeWorkspaceBindings }) {
 const [status, setStatus] = useState("Not run on a device");
 const [tenant, setTenant] = useState("");
 const [busy, setBusy] = useState(false);
 const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
 async function action(work: () => Promise<unknown>, message: string) {
  setWorkspaceEpoch(value => value + 1);
  setBusy(true);
  try { await work(); setStatus(message); }
  catch { setStatus("BLOCKED: authentication, storage or lifecycle check refused. No fallback."); }
  finally { setBusy(false); }
 }
 async function checkEncryption() {
  const store = await openNativeStore();
  try { await store.read(); } finally { await store.close(); }
 }
 return <SafeAreaView><Text>JobGuard — synthetic native risk slice</Text>
  <Text>HELD: device proof is not done. D08 is closed.</Text>
  <Text>Sign-in and offline commands are RED. No real data or production use.</Text>
  <Button title="Check native SQLCipher" disabled={busy} onPress={() => void action(checkEncryption, "SQLCipher catalog opened. Extracted-file and restart proof still required.")} />
  <Text>{client ? "Synthetic AuthProvider transport supplied" : "Synthetic auth transport not connected"}</Text>
  <TextInput accessibilityLabel="Fictional tenant UUID" value={tenant} onChangeText={setTenant} autoCapitalize="none" autoCorrect={false} editable={!busy} />
  <Button title="Exchange synthetic session" disabled={busy || !client} onPress={() => client && void action(() => client.exchange(tenant), "Synthetic exchange completed; device proof remains held.")} />
  <Button title="Restore secure session metadata" disabled={busy || !client} onPress={() => client && void action(() => client.resume(), "Restored metadata remains locked until reconnect.")} />
  <Button title="Reconnect and check membership" disabled={busy || !client} onPress={() => client && void action(() => client.reconnect(), "Server revalidation completed; offline clock approval remains held.")} />
  <Button title="Refresh synthetic session" disabled={busy || !client} onPress={() => client && void action(() => client.refresh(), "Refresh completed. A lost response requires recovery.")} />
  <Button title="Switch fictional tenant" disabled={busy || !client} onPress={() => client && void action(() => client.switchTenant(tenant), "Tenant switch completed after old-partition cleanup.")} />
  <Button title="Log out and clean local partition" disabled={busy || !client} onPress={() => client && void action(() => client.logout(), "Logout and local cleanup completed.")} />
  {native ? <WorkspaceScreens key={`${JSON.stringify(native.partition)}:${native.authorityGeneration}:${workspaceEpoch}`} binding={native} /> : <Text>Native workflow adapters are not connected. Device proof remains held.</Text>}
  <Text accessibilityLiveRegion="polite">{status}</Text>
 </SafeAreaView>;
}
