import type { LocalSpeechAdapter, LocalSpeechSession } from "./local-dictation";

export const LOCAL_SPEECH_DOWNLOAD_MIB = "42.4";
type Callbacks = Parameters<LocalSpeechAdapter["start"]>[0];

// Constructed only by a user gesture. Neither native speech nor remote providers are used.
export function createLocalSpeechAdapter(progress:(percent:number)=>void):LocalSpeechAdapter|null {
  if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof WebAssembly === "undefined" || !window.AudioContext || !crypto.subtle) return null;
  let worker:Worker|undefined, stream:MediaStream|undefined, context:AudioContext|undefined;
  let source:MediaStreamAudioSourceNode|undefined, processor:ScriptProcessorNode|undefined;
  let callbacks:Callbacks|undefined, ready=false, cancelled=false, stopping=false, pending=0, sequence=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const dispose = () => {
    cancelled=true; ready=false; clearTimeout(timer);
    if(processor){processor.onaudioprocess=null;processor.disconnect()}
    source?.disconnect(); stream?.getTracks().forEach(track=>track.stop());
    void context?.close().catch(()=>{});worker?.terminate();worker=undefined;
  };
  let rejectLoad:((reason:Error)=>void)|undefined;
  const fail = () => { const cb=callbacks;dispose();rejectLoad?.(new Error("Local speech unavailable"));cb?.error("local-unavailable"); };
  const finish = () => {const cb=callbacks;dispose();cb?.end()};
  const session:LocalSpeechSession={
    stop(){if(cancelled||stopping)return;stopping=true;if(processor)processor.onaudioprocess=null;stream?.getTracks().forEach(track=>track.stop());
      if(pending===0)worker?.postMessage({action:"retrieveFinalResult",recognizerId:"draft"});
      timer=setTimeout(fail,10_000);
    },
    cancel(){dispose()},
  };
  return {
    configuration:{language:"en-GB",processLocally:true,remoteFallback:false},
    async available(){return ready?"installed":"downloadable"},
    async install(){
      try {
        // Safari requires AudioContext creation/resume in the original tap, before any await.
        context=new AudioContext();let resumeFailed=false;
        const resumed=context.resume().catch(()=>{resumeFailed=true});
        const requested=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
        stream=await requested;await resumed;if(resumeFailed)throw Error("Audio context unavailable");
        if(cancelled){stream.getTracks().forEach(track=>track.stop());return false}
        await new Promise<void>((resolve,reject)=>{
          rejectLoad=reject;worker=new Worker("/local-speech/worker.js",{name:"jobguard-local-speech"});
          timer=setTimeout(fail,180_000);
          worker.onerror=fail;worker.onmessageerror=fail;
          worker.onmessage=({data})=>{
            if(cancelled||!data||typeof data.event!=="string")return;
            if(data.event==="progress"&&Number.isFinite(data.loaded)&&data.total>0)progress(Math.min(100,Math.floor(data.loaded/data.total*100)));
            if(data.event==="error"){fail();return}
            if(data.event==="load"){
              if(data.result!==true){fail();return}
              worker?.postMessage({action:"create",recognizerId:"draft",sampleRate:context!.sampleRate});return;
            }
            if(data.event==="recognizer-ready"){
              ready=true;clearTimeout(timer);rejectLoad=undefined;resolve();return;
            }
            if(data.event==="partialresult"||data.event==="result"){
              if(typeof data.result?.partial==="string")callbacks?.interim(data.result.partial);
              if(typeof data.result?.text==="string"&&data.result.text.trim())callbacks?.final(data.result.text,`${++sequence}:${data.result.text}`);
              if(pending>0){pending--;if(stopping&&pending===0)worker?.postMessage({action:"retrieveFinalResult",recognizerId:"draft"})}
              else if(stopping)finish();
            }
          };
          worker.postMessage({action:"boot"});
        });
        return true;
      } catch {dispose();return false}
    },
    start(cb){
      if(!ready||!worker||!context||!stream)throw Error("Local speech not ready");
      callbacks=cb;
      source=context.createMediaStreamSource(stream);
      // A bounded streaming buffer, never MediaRecorder, storage, or a network payload.
      processor=context.createScriptProcessor(4096,1,1);
      processor.onaudioprocess=event=>{
        if(cancelled||stopping)return;
        if(pending>=64){fail();return} // decoder cannot keep up: preserve page and typed path
        const pcm=event.inputBuffer.getChannelData(0).map(value=>value*32768);
        pending++;worker?.postMessage({action:"audioChunk",recognizerId:"draft",sampleRate:context!.sampleRate,data:pcm},[pcm.buffer]);
      };
      source.connect(processor);processor.connect(context.destination);return session;
    },
    // Internal resource cancellation is also available while install is pending.
    cancel:dispose,
  } as LocalSpeechAdapter & {cancel():void};
}
export function cancelLocalSpeech(adapter:LocalSpeechAdapter|null){(adapter as (LocalSpeechAdapter & {cancel?:()=>void})|null)?.cancel?.()}
