import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {TRACKS,CUES,score,renderTrack,renderCue,pcmStats,wav,type Track} from '../worlds/oboro/src/score'
const hash=(v:Float32Array)=>createHash('sha256').update(new Uint8Array(v.buffer)).digest('hex')
test('18 original arrangements render finite, bounded, non-silent, seamless and distinct loops',()=>{
 const seen=new Set<string>()
 for(const track of Object.keys(TRACKS) as Track[])for(const arrangement of ['miyabi','kage'] as const){const pcm=renderTrack(track,arrangement),s=pcmStats(pcm);assert.ok(s.finite&&s.peak<.72&&s.rms>.015,`${track} ${arrangement} ${JSON.stringify(s)}`);assert.ok(s.seam<.035&&s.seam<s.maxDelta+.001,`${track} loop boundary ${s.seam}`);assert.ok(!seen.has(hash(pcm)));seen.add(hash(pcm));assert.equal(wav(pcm).length,44+pcm.length*2)}
 assert.equal(seen.size,18)
})
test('alternate arrangement changes melody, rhythm and instrumentation, not just tempo',()=>{
 for(const track of Object.keys(TRACKS) as Track[]){const a=score(track,'miyabi'),b=score(track,'kage');assert.notDeepEqual(a.map(n=>n.midi),b.map(n=>n.midi));assert.notDeepEqual(a.map(n=>n.beat),b.map(n=>n.beat));assert.notDeepEqual(a.map(n=>n.voice),b.map(n=>n.voice))}
})
test('every sound effect has four distinct bounded variants with quiet start and tail',()=>{
 for(const cue of CUES){const seen=new Set();for(let v=0;v<4;v++){const p=renderCue(cue,v),s=pcmStats(p);assert.ok(s.finite&&s.peak<.7&&s.rms>.001);assert.ok(Math.abs(p[0])<.001&&Math.abs(p.at(-1)!)<.001);seen.add(hash(p))}assert.equal(seen.size,4,cue)}
})
