import {chromium} from 'playwright-core'
import {build} from 'esbuild'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const code=(await build({stdin:{contents:"export * from './worlds/oboro/src/audio';export * from './worlds/oboro/src/score'",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'OboroAudio'})).outputFiles[0].text
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox']})
try{
 const p=await browser.newPage();await p.setContent('<button id="start">Start audio test</button>');await p.addScriptTag({content:code})
 const result=await p.evaluate(async()=>{
  const A=window.OboroAudio,sr=22050
  const mix=async(duck=false,mute=false,bgm=1,se=1)=>{const c=new OfflineAudioContext(1,sr*3,sr),e=new A.SoundEngine(c,c.destination);e.configure({...A.DEFAULT_AUDIO,bgm,se,bgmMute:mute,seMute:mute},true,duck)
   const add=(pcm,bus,loop=false)=>{const b=c.createBuffer(1,pcm.length,sr);b.getChannelData(0).set(pcm);const source=c.createBufferSource();source.buffer=b;source.loop=loop;source.connect(bus);source.start(.2)}
   add(A.renderTrack('chase','kage'),e.bgm,true);add(A.renderTrack('escape','miyabi'),e.bgm,true)
   for(let i=0;i<12;i++)add(A.renderCue(i%2?'hurt':'hit',i),e.se)
   const b=await c.startRendering(),stats=A.pcmStats(b.getChannelData(0));e.dispose();return stats}
  return {stress:await mix(),duck:await mix(true),mute:await mix(false,true),musicOnly:await mix(false,false,1,0),seOnly:await mix(false,false,0,1),quiet:await mix(false,false,.15,.15)}
 })
 assert.ok(result.stress.finite&&result.stress.peak<.95&&result.stress.rms>.01,JSON.stringify(result))
 assert.ok(result.duck.rms<result.stress.rms*.85,'receive-voice ducking reduces actual rendered mixer output');assert.equal(result.mute.peak,0);assert.ok(result.musicOnly.rms>.01&&result.seOnly.rms>.01);assert.ok(result.quiet.rms<result.stress.rms*.6)
 await p.evaluate(()=>{document.querySelector('#start').onclick=async()=>{const A=window.OboroAudio,c=new AudioContext();await c.resume();window.engine=new A.SoundEngine(c,c.createMediaStreamDestination());window.engine.configure(A.DEFAULT_AUDIO,true);window.audioContext=c}})
 await p.click('#start');await p.waitForFunction(()=>window.engine?.stats().music===1)
 const stats=()=>p.evaluate(()=>window.engine.stats())
 for(let i=0;i<5;i++){await p.evaluate(()=>window.engine.cue('hit'));await p.waitForTimeout(90)}
 let s=await stats();assert.deepEqual(s.history.map(e=>e.variant),[0,1,2,3,0]);assert.ok(s.music===1)
 await p.evaluate(()=>{window.engine.select('water');window.engine.select('void');window.engine.select('chase');for(let i=0;i<100;i++)window.engine.cue('hurt')});s=await stats();assert.ok(s.music<=2&&s.active<=14&&s.dropped>=95)
 await p.waitForTimeout(1400);s=await stats();assert.equal(s.music,1);assert.equal(s.se,0)
 await p.evaluate(()=>window.engine.setHidden(true));s=await stats();assert.equal(s.active,0);assert.equal(s.hidden,true)
 await p.waitForTimeout(300);await p.evaluate(()=>window.engine.setHidden(false));s=await stats();assert.equal(s.music,1);assert.equal(s.se,0)
 await p.evaluate(()=>window.engine.reset());s=await stats();assert.equal(s.active,1);assert.deepEqual(s.history.slice(-1)[0].kind,'hurt')
 await p.evaluate(()=>window.engine.configure(window.OboroAudio.DEFAULT_AUDIO,false));assert.equal((await stats()).active,0)
 await p.evaluate(()=>window.engine.dispose());s=await stats();assert.equal(s.active,0);assert.equal(s.cache,0);await p.evaluate(()=>window.audioContext.close())
 writeFileSync(`${out}/game-audio-results.json`,JSON.stringify({result,lifecycle:s,execution:'Actual Chromium OfflineAudioContext game buses/limiter render + running AudioContext lifecycle into a local MediaStreamDestination; no microphone, external service or physical listening.'},null,2));console.log('PASS full game audio mixer renders without clipping; variants, crossfade bounds, background/reset/disposal',JSON.stringify(result))
}finally{await browser.close()}
