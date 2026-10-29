import {renderTrack,renderCue,SAMPLE_RATE,type Track,type Arrangement,type Cue} from './score'
export type AudioSettings={bgm:number;se:number;bgmMute:boolean;seMute:boolean;arrangement:Arrangement;track:'auto'|Track}
export const DEFAULT_AUDIO:AudioSettings={bgm:.48,se:.65,bgmMute:false,seMute:false,arrangement:'miyabi',track:'auto'}
type Listener={context:AudioContext;getInput():AudioNode}
type Voice={source:AudioBufferSourceNode;nodes:AudioNode[];kind:'music'|'se'}
const engines=new WeakMap<AudioContext,SoundEngine>()
/** Bounded game-only buses. VoiceManager's remote speech never passes through these gains. */
export class SoundEngine {
 readonly bgm:GainNode;readonly se:GainNode;readonly limiter:DynamicsCompressorNode;readonly safety:WaveShaperNode
 private voices=new Set<Voice>();private music:Voice|null=null;private cache=new Map<string,AudioBuffer>();private variants=new Map<string,number>();private lastCue=new Map<string,number>();private lastAny=-100
 private selected='';private settings:AudioSettings=DEFAULT_AUDIO;private enabled=false;private hidden=false;private disposed=false;private duck=false;private currentTrack:Track='explore';private counts={played:0,dropped:0,switches:0,disposed:0};private history:{kind:string;variant:number}[]=[]
 constructor(readonly context:AudioContext,out:AudioNode){this.bgm=context.createGain();this.se=context.createGain();this.limiter=context.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=8;this.limiter.attack.value=.006;this.limiter.release.value=.18;this.bgm.gain.value=0;this.se.gain.value=0;this.bgm.connect(this.limiter);this.se.connect(this.limiter);this.safety=context.createWaveShaper();const curve=new Float32Array(4097);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=.85*Math.tanh(x/.85)}this.safety.curve=curve;this.safety.oversample='2x';this.limiter.connect(this.safety);this.safety.connect(out)}
 configure(settings:AudioSettings,enabled:boolean,duck=false){this.settings={...settings,bgm:Math.max(0,Math.min(1,settings.bgm)),se:Math.max(0,Math.min(1,settings.se))};this.enabled=enabled;this.duck=duck;this.gains();if(!enabled){this.clearVoices();this.selected=''}else this.select(this.currentTrack)}
 private gains(){const t=this.context.currentTime,on=this.enabled&&!this.hidden&&!this.disposed;this.bgm.gain.setTargetAtTime(on&&!this.settings.bgmMute?this.settings.bgm*(this.duck?.38:1):0,t,.06);this.se.gain.setTargetAtTime(on&&!this.settings.seMute?this.settings.se*(this.duck?.7:1):0,t,.025)}
 private buffer(key:string,render:()=>Float32Array){let b=this.cache.get(key);if(!b){const pcm=render();b=this.context.createBuffer(1,pcm.length,SAMPLE_RATE);b.getChannelData(0).set(pcm);this.cache.set(key,b);while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value!)}else{this.cache.delete(key);this.cache.set(key,b)}return b}
 private stop(v:Voice,when=this.context.currentTime){try{v.source.stop(when)}catch{}if(when<=this.context.currentTime+.001)this.remove(v)}
 private remove(v:Voice){if(!this.voices.delete(v))return;v.source.onended=null;v.source.disconnect();v.nodes.forEach(n=>n.disconnect());this.counts.disposed++}
 private make(buffer:AudioBuffer,bus:AudioNode,kind:Voice['kind'],gain=1,pos?:readonly number[]){const source=this.context.createBufferSource(),g=this.context.createGain(),nodes:AudioNode[]=[g];source.buffer=buffer;g.gain.value=gain;source.connect(g);if(pos){const p=this.context.createPanner();p.panningModel='equalpower';p.distanceModel='inverse';p.refDistance=2;p.maxDistance=28;p.rolloffFactor=1.4;p.positionX.value=pos[0];p.positionY.value=pos[1];p.positionZ.value=pos[2];g.connect(p);p.connect(bus);nodes.push(p)}else g.connect(bus);const v={source,nodes,kind};this.voices.add(v);source.onended=()=>this.remove(v);return v}
 select(track:Track){this.currentTrack=track;if(!this.enabled||this.hidden||this.disposed||this.context.state!=='running')return;const selected=this.settings.track==='auto'?track:this.settings.track,key=selected+':'+this.settings.arrangement;if(this.selected===key)return
  // Keep only one fading predecessor even during rapid state changes.
  for(const v of this.voices)if(v.kind==='music'&&v!==this.music)this.stop(v)
  const b=this.buffer(key,()=>renderTrack(selected,this.settings.arrangement)),next=this.make(b,this.bgm,'music',0),t=this.context.currentTime
  next.source.loop=true;(next.nodes[0] as GainNode).gain.linearRampToValueAtTime(1,t+1.2);next.source.start(t)
  if(this.music){const g=(this.music.nodes[0] as GainNode).gain;g.cancelAndHoldAtTime(t);g.linearRampToValueAtTime(0,t+1.2);this.stop(this.music,t+1.25)}
  this.music=next;this.selected=key;this.counts.switches++
 }
 cue(kind:Cue,pos?:readonly number[],gain=1){const t=this.context.currentTime;if(!this.enabled||this.hidden||this.disposed||this.settings.seMute||this.settings.se===0||this.context.state!=='running')return false
  if(t-this.lastAny<.025||t-(this.lastCue.get(kind)??-100)<.075||[...this.voices].filter(v=>v.kind==='se').length>=12){this.counts.dropped++;return false}
  const variant=((this.variants.get(kind)??-1)+1)%4;this.variants.set(kind,variant);this.lastCue.set(kind,t);this.lastAny=t
  const b=this.buffer(kind+':'+variant,()=>renderCue(kind,variant)),v=this.make(b,this.se,'se',Math.max(0,Math.min(1,gain)),pos);v.source.start(t);this.counts.played++;this.history.push({kind,variant});this.history=this.history.slice(-32);return true
 }
 setHidden(hidden:boolean){if(hidden===this.hidden)return;this.hidden=hidden;if(hidden){this.clearVoices();this.selected=''}this.gains();if(!hidden)this.select(this.currentTrack)}
 reset(){this.clearVoices();this.selected='';this.variants.clear();this.lastCue.clear();this.lastAny=-100;this.select(this.currentTrack)}
 private clearVoices(){for(const v of [...this.voices])this.stop(v);this.music=null}
 stats(){return{...this.counts,active:this.voices.size,music:[...this.voices].filter(v=>v.kind==='music').length,se:[...this.voices].filter(v=>v.kind==='se').length,cache:this.cache.size,selected:this.selected,enabled:this.enabled,hidden:this.hidden,duck:this.duck,context:this.context.state,settings:{...this.settings},history:[...this.history]}}
 dispose(){this.disposed=true;this.clearVoices();this.cache.clear();this.bgm.disconnect();this.se.disconnect();this.limiter.disconnect();this.safety.disconnect();if(engines.get(this.context)===this)engines.delete(this.context)}
}
export function attachAudio(listener:Listener){const old=engines.get(listener.context);old?.dispose();const engine=new SoundEngine(listener.context,listener.getInput());engines.set(listener.context,engine);return engine}
export function play(listener:Listener,kind:Cue){return engines.get(listener.context)?.cue(kind)??false}
export function playAt(listener:Listener,kind:Cue,pos:readonly number[],volume=1){return engines.get(listener.context)?.cue(kind,pos,volume)??false}
