import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {TRACKS,CUES,renderTrack,renderCue,pcmStats,wav,SAMPLE_RATE,type Track} from '../worlds/oboro/src/score'
const checking=process.argv.includes('--check'),out=process.argv[2]&&!checking?process.argv[2]:'assets/audio-preview';if(!checking)mkdirSync(out,{recursive:true})
const save=(path:string,data:Uint8Array|string)=>{if(checking){if(!Buffer.from(data).equals(readFileSync(path)))throw Error('Regenerate audio preview: '+path)}else writeFileSync(path,data)}
const tracks=[],segments=[] as {name:string;start:number;end:number}[],clips:Float32Array[]=[];let offset=0
for(const id of Object.keys(TRACKS) as Track[])for(const arrangement of ['miyabi','kage'] as const){const pcm=renderTrack(id,arrangement),stats=pcmStats(pcm);if(!stats.finite||stats.peak>=.72||stats.rms<=.015||stats.seam>=.035)throw Error(`${id} invalid render`);tracks.push({id,name:TRACKS[id].name,arrangement,seconds:pcm.length/SAMPLE_RATE,...stats,sha256:createHash('sha256').update(wav(pcm)).digest('hex')});const clip=pcm.slice(0,SAMPLE_RATE*4);for(let i=0;i<clip.length;i++)clip[i]*=Math.min(1,i/(SAMPLE_RATE*.025),(clip.length-i)/(SAMPLE_RATE*.12));clips.push(clip);segments.push({name:`${id}:${arrangement}`,start:offset,end:offset+clip.length/SAMPLE_RATE});offset+=clip.length/SAMPLE_RATE}
const concat=(parts:Float32Array[])=>{const result=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){result.set(p,o);o+=p.length}return result}
save(`${out}/oboro-music-preview.wav`,wav(concat(clips)))
const effects=[];const sounds=[];offset=0
for(const cue of CUES){for(let v=0;v<4;v++){const pcm=renderCue(cue,v);sounds.push(pcm,new Float32Array(Math.floor(SAMPLE_RATE*.06)));effects.push({cue,variant:v,start:offset,...pcmStats(pcm)});offset+=(pcm.length/SAMPLE_RATE)+.06}}
save(`${out}/oboro-se-preview.wav`,wav(concat(sounds)))
save(`${out}/AUDIO_PREVIEW.json`,JSON.stringify({license:'AGPL-3.0-only',source:'Original procedural synthesis and original note sequences; no sampled recordings or external AI service.',sampleRate:SAMPLE_RATE,channels:1,format:'PCM 16-bit WAV',validation:'Numeric full-loop peak/RMS/finite/seam checks. Not a human listening or physical speaker test.',tracks,segments,effects},null,2)+'\n')
console.log(JSON.stringify({tracks:tracks.length,effects:effects.length,musicSeconds:72,seSeconds:offset,directory:out}))
