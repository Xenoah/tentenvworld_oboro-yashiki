import {test} from 'node:test'
import assert from 'node:assert/strict'
import {acousticZone,voiceZone} from '../worlds/oboro/src/acousticZones'
import {VOICE_PRESETS} from '../apps/client/src/net/voiceAcoustics'
test('head height distinguishes underwater from the room above; alcoves and corridors echo, courtyard stays dry',()=>{
 assert.equal(acousticZone([-14,-1,-18]),'underwater');assert.equal(acousticZone([-14,1.5,-18]),'room');assert.equal(acousticZone([-14,.04,-18]),'underwater');assert.equal(acousticZone([-14,.12,-18]),'room')
 assert.equal(acousticZone([-17,1.5,-3]),'narrow');assert.equal(acousticZone([-15.6,1.5,10]),'narrow')
 assert.equal(acousticZone([-13,1.5,2]),'room');assert.equal(acousticZone([-9.3,1.5,2]),'narrow');assert.equal(acousticZone([3,1.5,7]),'outdoor')
 assert.equal(acousticZone([NaN,0,0]),'outdoor')
})
test('water at either voice endpoint muffles, listener room takes priority, outdoor listener hears speaker room',()=>{
 for(const z of ['outdoor','room','narrow','underwater'] as const){assert.equal(voiceZone(z,'underwater'),'underwater');assert.equal(voiceZone('underwater',z),'underwater')}
 assert.equal(voiceZone('narrow','room'),'narrow');assert.equal(voiceZone('outdoor','room'),'room');assert.equal(voiceZone('outdoor','outdoor'),'outdoor')
 for(const p of Object.values(VOICE_PRESETS)){assert.ok(p.wet+p.echo<.4);assert.ok(p.cutoff>=700&&p.cutoff<=22000);assert.ok(p.delay>0&&p.delay<=.25);assert.ok(p.decay<=1)}
})
