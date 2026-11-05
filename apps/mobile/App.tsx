import { useState } from "react";
import { SafeAreaView, Text, Button } from "react-native";
import { openNativeStore } from "./src/native-store";
export default function App() {
 const [status, setStatus] = useState("Not run on a device");
 const [busy, setBusy] = useState(false);
 async function checkEncryption() {
  setBusy(true);
  try {
   const store = await openNativeStore();
   try { await store.read(); setStatus("SQLCipher catalog opened. Extracted-file and restart proof still required."); }
   finally { await store.close(); }
  } catch { setStatus("BLOCKED: encrypted store unavailable. No fallback."); }
  finally { setBusy(false); }
 }
 return <SafeAreaView><Text>JobGuard — synthetic native risk slice</Text>
  <Text>HELD: device proof is not done. D08 is closed.</Text>
  <Text>Sign-in and offline commands are RED. No real data or production use.</Text>
  <Button title="Check native SQLCipher" disabled={busy} onPress={() => void checkEncryption()} />
  <Text accessibilityLiveRegion="polite">{status}</Text>
 </SafeAreaView>;
}
