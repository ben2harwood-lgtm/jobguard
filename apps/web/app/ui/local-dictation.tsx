"use client";

import { useEffect, useRef, useState } from "react";
import { cancelLocalSpeech, createLocalSpeechAdapter, LOCAL_SPEECH_DOWNLOAD_MIB } from "./local-speech";

export type LocalAvailability = "installed" | "downloadable" | "downloading" | "unavailable";
export type LocalSpeechSession = { stop():void; cancel():void };
export type LocalSpeechAdapter = {
  readonly configuration:{language:"en-GB";processLocally:true;remoteFallback:false};
  available():Promise<LocalAvailability>;
  install():Promise<boolean>;
  start(callbacks:{interim(text:string):void;final(text:string,eventId:string):void;error(code:string):void;end():void}):LocalSpeechSession;
};

declare global { interface Window { __JOBGUARD_SPEECH_ADAPTER__?:LocalSpeechAdapter } }

// Retain the deterministic contract hook; real engines are created only on a tap.
export function browserLocalSpeechAdapter(_discoverNative=true):LocalSpeechAdapter|null {
  return typeof window === "undefined" ? null : window.__JOBGUARD_SPEECH_ADAPTER__ ?? null;
}

export type DictationFailure = "denied" | "no_microphone" | "no_speech" | "unsupported" | "failed";
/** A refused or missing microphone, from the DOMException name; anything else stopped the microphone. */
export function speechFailure(error: unknown): DictationFailure {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_microphone";
  return "failed";
}
/** Recognition error codes reported during listening. */
export function listeningFailure(code: string): DictationFailure {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "audio-capture") return "no_microphone";
  return code === "no-speech" ? "no_speech" : "failed";
}
export function dictationMessage(code: DictationFailure, startLabel = "Talk through a quote"): string {
  switch (code) {
    case "denied": return `JobGuard can't use your microphone. To allow it, open this site's settings from the address bar, allow Microphone, then press ${startLabel} again. You can type the job below instead.`;
    case "no_microphone": return "No microphone found. You can type the job below instead.";
    case "no_speech": return `We didn't hear anything. Press ${startLabel} to try again, or type below.`;
    case "unsupported": return "Voice doesn't work in this browser. Type the job below. It works the same way.";
    case "failed": return "The microphone stopped. Your words so far are kept. You can try again or type.";
  }
}

export function LocalDictation({onUse,applyDisabled=false,startLabel="Talk through a quote",designed=false}:{onUse:(text:string,raw:string)=>void;applyDisabled?:boolean;startLabel?:string;designed?:boolean}){
  const[adapter,setAdapter]=useState<LocalSpeechAdapter|null>(null),[availability,setAvailability]=useState<LocalAvailability|"checking">("installed"),[listening,setListening]=useState(false),[loading,setLoading]=useState(false),[interim,setInterim]=useState(""),[finalText,setFinalText]=useState(""),[message,setMessage]=useState("");
  const session=useRef<LocalSpeechSession|null>(null), seen=useRef(new Set<string>()),raw=useRef<string[]>([]);
  const recordingSnapshot=useRef({text:"",provisional:"",rawLength:0});
  const[provisional,setProvisional]=useState("");
  const pending=useRef(""), recording=useRef(0);
  const active=useRef(true), engine=useRef<LocalSpeechAdapter|null>(null), busy=useRef(false), stopped=useRef(false);
  useEffect(()=>{active.current=true;
    // Only test injection is inspected on mount. No real capability probe, permission, worker or model load.
    const injected=browserLocalSpeechAdapter();
    if(injected){setAdapter(injected);void injected.available().then(value=>{if(active.current)setAvailability(value)}).catch(()=>{if(active.current)setAvailability("unavailable")})}
    return()=>{active.current=false;recording.current++;session.current?.cancel();cancelLocalSpeech(engine.current);session.current=null};
  },[]);
  const failed=(code:DictationFailure)=>setMessage(dictationMessage(code,startLabel));
  // One press: ask for the microphone, load the on-device model if needed, then listen.
  async function tap(){
    if(busy.current||applyDisabled||listening)return;
    setMessage("");
    if(adapter&&availability==="installed"){start(adapter);return}
    const value=adapter??createLocalSpeechAdapter(percent=>{if(active.current)setMessage(`Loading on-device voice: ${percent}%`)});
    if(!value){setAvailability("unavailable");return}
    if(!adapter)engine.current=value;
    busy.current=true;stopped.current=false;setLoading(true);
    let failure:DictationFailure|null=null;
    try{if(!await value.install())failure="failed"}catch(error){failure=speechFailure(error)}
    busy.current=false;
    if(!active.current){cancelLocalSpeech(value);return}
    setLoading(false);
    if(stopped.current){stopped.current=false;setMessage("");return}
    if(failure){failed(failure);return}
    if(adapter)setAvailability("installed");
    start(value);
  }
  function stopLoading(){stopped.current=true;cancelLocalSpeech(engine.current);setLoading(false);setMessage("")}
  function start(value:LocalSpeechAdapter){
    if(value.configuration.language!=="en-GB"||!value.configuration.processLocally||value.configuration.remoteFallback){setAvailability("unavailable");return}
    recordingSnapshot.current={text:finalText,provisional,rawLength:raw.current.length};
    const token=++recording.current;
    setMessage("");pending.current="";setInterim("");seen.current.clear();setListening(true);
    function finish(message?:string){
      if(token!==recording.current)return;
      recording.current++;session.current=null;setListening(false);
      const partial=pending.current;pending.current="";setInterim("");
      if(partial)setProvisional(old=>[old,partial].filter(Boolean).join("\n"));
      if(message||partial)setMessage([message,partial?"Listening stopped. Provisional words are kept below. Check or edit them before using them.":""].filter(Boolean).join(" "));
    }
    try{
      const next=value.start({
        interim:text=>{if(token!==recording.current)return;pending.current=text;setInterim(text)},
        final:(text,id)=>{if(token!==recording.current||seen.current.has(id))return;seen.current.add(id);raw.current.push(text);setFinalText(old=>`${old}${old?" ":""}${text}`.trim());pending.current="";setInterim("")},
        error:code=>{if(token!==recording.current)return;const current=session.current;finish(dictationMessage(listeningFailure(code),startLabel));current?.cancel()},
        end:()=>finish(),
      });
      if(token===recording.current)session.current=next;
    }catch{finish(dictationMessage("failed",startLabel));cancelLocalSpeech(value)}
  }
  function stop(){session.current?.stop()}
  function cancel(){recording.current++;pending.current="";session.current?.cancel();session.current=null;setListening(false);setInterim("");setFinalText(recordingSnapshot.current.text);setProvisional(recordingSnapshot.current.provisional);raw.current.length=recordingSnapshot.current.rawLength}
  const buttonClass=designed?"btn":undefined;
  return <section className={designed?"dictation card card-body form":"dictation"} aria-label="On-device dictation">
    <h2>Say the job out loud</h2>
    {availability==="unavailable"?<p>{dictationMessage("unsupported",startLabel)}</p>:<p>Uses your microphone on this phone or computer. The voice model ({LOCAL_SPEECH_DOWNLOAD_MIB} MiB) downloads once, the first time. Nothing you say leaves this device.</p>}
    <button type="button" className={buttonClass} disabled={applyDisabled||availability==="unavailable"||availability==="checking"||listening||loading} onClick={()=>void tap()}>{startLabel}</button>
    {loading&&<><p role="status">Getting the microphone ready…</p><button type="button" className={buttonClass} onClick={stopLoading}>Cancel</button></>}
    {/* A pending draft must never prevent stopping an already active microphone. */}
    {listening&&<><p>Listening on this device</p><p className="helper">Press Stop listening when you've finished. You check the words before they're used.</p><button type="button" className={buttonClass} onClick={stop}>Stop listening</button><button type="button" className={buttonClass} onClick={cancel}>Cancel dictation</button></>}
    {interim&&<p className="dictation-interim" data-testid="interim-transcript"><span>Provisional: </span>{interim}</p>}
    {provisional&&<><label htmlFor="dictation-provisional">Provisional words to review</label><textarea id="dictation-provisional" disabled={applyDisabled} value={provisional} onChange={e=>{if(!applyDisabled)setProvisional(e.target.value)}}/></>}
    {(finalText||provisional)&&<><label htmlFor="dictation-final">Words to review</label><textarea id="dictation-final" disabled={applyDisabled} value={finalText} onChange={e=>{if(!applyDisabled)setFinalText(e.target.value)}}/><button type="button" className={buttonClass} disabled={applyDisabled} onClick={()=>{if(applyDisabled)return;recording.current++;session.current?.cancel();cancelLocalSpeech(engine.current);setListening(false);onUse([finalText,provisional].filter(Boolean).join(" "),raw.current.join(" "))}}>Use these words</button></>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
