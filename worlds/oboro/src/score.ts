/** Original OBORO compositions and procedural instruments; no sampled recordings. AGPL-3.0-only. */
export const TRACKS = {
 explore:{name:'月下の縁側',bpm:78,root:62,melody:[0,2,4,2,1,0,3,2, 4,3,2,0,1,2,1,-1]},
 reflex:{name:'三枚の影札',bpm:112,root:67,melody:[0,3,1,4,2,1,3,0, 2,4,3,1,0,2,4,2]},
 jump:{name:'飛燕の梁',bpm:120,root:60,melody:[0,2,5,4,2,3,6,4, 1,3,5,3,2,4,6,5]},
 water:{name:'水底の灯',bpm:68,root:57,melody:[4,2,1,0,2,1,-1,0, 3,2,0,-1,1,0,2,1]},
 void:{name:'星を織る蔵',bpm:72,root:65,melody:[0,4,2,6,3,1,5,2, 1,5,3,0,4,2,6,4]},
 inverse:{name:'裏月の回廊',bpm:92,root:59,melody:[4,3,1,2,0,-1,2,1, 3,1,0,2,-1,1,3,0]},
 chase:{name:'影走り',bpm:144,root:50,melody:[0,0,1,3,0,2,1,-1, 0,3,2,4,1,0,-1,0]},
 escape:{name:'暁の門',bpm:100,root:62,melody:[0,2,4,5,3,4,6,5, 2,4,5,7,6,4,2,5]},
 defeat:{name:'霧の牢',bpm:64,root:55,melody:[4,2,1,0,3,1,0,-1, 2,0,-1,-2,1,0,-1,0]},
} as const
export type Track = keyof typeof TRACKS
export type Arrangement = 'miyabi'|'kage'
export type Instrument = 'koto'|'shamisen'|'flute'|'bell'|'taiko'|'wood'|'brush'
export type Note = {beat:number;length:number;midi:number;gain:number;voice:Instrument}
export const SAMPLE_RATE=22050
const yo=[0,2,5,7,9],inScale=[0,1,5,7,8]
function degree(root:number,n:number,dark:boolean){const scale=dark?inScale:yo;return root+scale[((n%5)+5)%5]+12*Math.floor(n/5)}
export function score(track:Track,arrangement:Arrangement):Note[]{
 const c=TRACKS[track],dark=arrangement==='kage',notes:Note[]=[],lead:Instrument=track==='water'||track==='defeat'?'flute':track==='void'?'bell':dark?'shamisen':'koto'
 const add=(beat:number,length:number,midi:number,gain:number,voice:Instrument)=>notes.push({beat,length,midi,gain,voice})
 // Eight bars. The second arrangement has a different answering phrase, syncopation and scale.
 for(let i=0;i<16;i++){
  const motif=c.melody[i],n=dark?(i>=8?c.melody[(i+5)%16]-1:motif):motif
  const beat=i*2+(dark&&i%4===3?.5:0)
  add(beat,lead==='flute'?1.65:1.2,degree(c.root,n,dark),lead==='bell'?.12:.18,lead)
  if(i%2===0)add(beat+.75,1.1,degree(c.root-12,dark?n-2:n+2,dark),.09,dark?'koto':'flute')
  if(track==='jump'||track==='chase'||track==='reflex')add(beat+1,.6,degree(c.root,n+(dark?-1:1),dark),.10,dark?'wood':'shamisen')
 }
 for(let bar=0;bar<8;bar++){
  add(bar*4,2.5,degree(c.root-24,bar%4===3?3:0,dark),.13,'koto')
  if(!['water','void','defeat'].includes(track)){
   add(bar*4,.8,44,.23,'taiko');add(bar*4+2,.4,76,.12,'wood')
   if(dark||track==='chase')add(bar*4+3.5,.6,48,.13,'taiko')
   if(track==='jump'||track==='reflex')add(bar*4+1.5,.25,72,.07,'brush')
  }else{add(bar*4+1.5,1.5,degree(c.root+12,(bar*3)%5,dark),.055,'bell')}
 }
 return notes
}
function rng(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1}}
/** Add a finite voice into a circular loop, including its release tail. */
function voice(data:Float32Array,sr:number,start:number,duration:number,hz:number,amp:number,kind:Instrument,seed:number,wrap:boolean){
 const length=Math.floor(duration*sr),offset=Math.floor(start*sr),random=rng(seed);let low=0
 for(let i=0;i<length;i++){
  const t=i/sr,x=i/length,phase=2*Math.PI*hz*t,attack=Math.min(1,t/(kind==='flute'?.07:.004)),release=Math.min(1,(duration-t)/.035)
  let wave=0,env=attack*release
  if(kind==='flute'){wave=Math.sin(phase+.035*Math.sin(2*Math.PI*5*t))+.18*Math.sin(phase*2)+random()*.055;env*=Math.sin(Math.PI*x)**.4}
  else if(kind==='taiko'){wave=Math.sin(2*Math.PI*(48*t+14*(1-Math.exp(-t*30))/30))+.12*random()*Math.exp(-t*50);env*=Math.exp(-t*7)}
  else if(kind==='brush'){low=low*.65+random()*.35;wave=low;env*=Math.exp(-t*18)}
  else if(kind==='wood'){wave=Math.sin(phase)+.45*Math.sin(phase*1.47);env*=Math.exp(-t*30)}
  else if(kind==='bell'){wave=Math.sin(phase)+.28*Math.sin(phase*2.76)+.12*Math.sin(phase*4.07);env*=Math.exp(-t*2.4)}
  else {wave=Math.sin(phase)+.32*Math.sin(phase*2)*Math.exp(-t*9)+.18*Math.sin(phase*3)*Math.exp(-t*15);if(kind==='shamisen')wave+=random()*.2*Math.exp(-t*40);env*=Math.exp(-t*(kind==='shamisen'?8:4))}
  const index=offset+i;if(!wrap&&index>=data.length)break
  data[index%data.length]+=wave*env*amp
 }
}
export function renderTrack(track:Track,arrangement:Arrangement,sr=SAMPLE_RATE){
 const seconds=32*60/TRACKS[track].bpm,data=new Float32Array(Math.round(seconds*sr)),notes=score(track,arrangement)
 notes.forEach((n,i)=>{const start=n.beat*60/TRACKS[track].bpm,duration=n.length*60/TRACKS[track].bpm;voice(data,sr,start,duration,440*2**((n.midi-69)/12),n.gain,n.voice,i+31,true)})
 // Quiet circular early reflections: tails across the loop boundary are baked into the same buffer.
 const dry=data.slice(),delay=Math.round(sr*.173);for(let i=0;i<data.length;i++)data[i]=.72*Math.tanh((dry[i]+dry[(i-delay+data.length)%data.length]*.16+dry[(i-delay*2+data.length)%data.length]*.07)/.9)
 return data
}
export const CUES=['seal','warp','star','alert','go','tick','coin','smoke','swing','hit','hurt','success','failure','door','step-sand','step-stone','step-wood','step-tatami','step-water','step-magic','land-sand','land-stone','land-wood','land-tatami','land-water','land-magic'] as const
export type Cue=typeof CUES[number]
export function renderCue(kind:Cue,variant:number,sr=SAMPLE_RATE){
 const dur=['seal','success','failure','door'].includes(kind)?1.2:kind.startsWith('land')?.5:.65,data=new Float32Array(Math.ceil(dur*sr)),v=((variant%4)+4)%4
 const add=(at:number,d:number,hz:number,g:number,voiceKind:Instrument)=>voice(data,sr,at,d,hz*([.97,1.03,.99,1.01][v]),g,voiceKind,97+v*31,false)
 if(kind.startsWith('step')||kind.startsWith('land')){
  const landing=kind.startsWith('land'),surface=kind.split('-')[1],g=landing?.44:.3
  add(0,landing?.38:.18,surface==='stone'?290:surface==='wood'?160:85,g,surface==='wood'||surface==='stone'?'wood':'brush')
  if(surface==='sand'||surface==='water')add(.025,.23,surface==='water'?190:80,g*.55,'brush')
  if(landing)add(.01,.3,52,.18,'taiko')
 }else if(['swing','smoke','warp','door'].includes(kind)){
  add(0,kind==='door'?.9:.4,150,.3,'brush');if(kind==='door')add(.08,.5,90,.21,'wood');if(kind==='warp')add(.08,.5,680,.13,'bell')
 }else if(['hurt','hit','alert','failure'].includes(kind)){
  add(0,.3,kind==='hit'?220:90,.32,'wood');add(.04,.42,60,.23,'taiko')
  if(kind==='alert'||kind==='failure')[620,410,310].forEach((f,i)=>add(i*.12,.45,f,.12,'shamisen'))
 }else{
  const tones=kind==='success'||kind==='seal'?[523,698,784,1047]:kind==='star'?[880,1175]:kind==='coin'?[1397,1760]:[kind==='go'?880:440]
  tones.forEach((f,i)=>add(i*.075,.55,f,.19,kind==='tick'?'wood':'bell'))
 }
 for(let i=0;i<data.length;i++)data[i]=.7*Math.tanh(data[i]/.8)*Math.min(1,(data.length-1-i)/(sr*.015))
 return data
}
export function pcmStats(d:Float32Array){let peak=0,sum=0,maxDelta=0;for(let i=0;i<d.length;i++){peak=Math.max(peak,Math.abs(d[i]));sum+=d[i]*d[i];if(i)maxDelta=Math.max(maxDelta,Math.abs(d[i]-d[i-1]))}return{peak,rms:Math.sqrt(sum/d.length),seam:Math.abs(d[0]-d.at(-1)!),maxDelta,finite:d.every(Number.isFinite)}}
export function wav(data:Float32Array,sr=SAMPLE_RATE){const bytes=new Uint8Array(44+data.length*2),v=new DataView(bytes.buffer);const text=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));text(0,'RIFF');v.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,data.length*2,true);for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,data[i]))*32767),true);return bytes}
