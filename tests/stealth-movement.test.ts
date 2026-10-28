import {test} from 'node:test'
import assert from 'node:assert/strict'
import {command,initialState,tick,lineOfSight,hearingRange,type GameState,type Player} from '../worlds/oboro/src/game.ts'
import {groundSurface,observeMotion,type Disturbance} from '../worlds/oboro/src/movement.ts'
const now=1_000_000,who='host'
const player=(y=0,grounded=true):Player=>({id:who,pos:[-4,y,0],grounded,speed:0})
function started(){const s=initialState(1);s.phase='running';s.startedAt=now-20000;s.updatedAt=now;s.roster=[who];s.protectedUntil[who]=0;s.enemies[0].pos=[1.5,0,0];s.enemies[1].pos=[7,0,-10];return tick(s,[player()],now+1)}
function flight(){let s=started();s=tick(s,[player(.25,false)],now+200);s=tick(s,[player(.95,false)],now+400);return tick(s,[player(.55,false)],now+600)}
test('material classifier distinguishes sand from actual stone path, floors and special zones',()=>{
 assert.equal(groundSurface([3,0,7]),'sand');assert.equal(groundSurface([1.2,0,8]),'stone');assert.equal(groundSurface([-14,0,0]),'tatami');assert.equal(groundSurface([0,0,12]),'wood');assert.equal(groundSurface([-14,-2,-18]),'water');assert.equal(groundSurface([0,4,-20]),'magic')
})
test('descending input within 75 cm makes exactly one quiet landing; duplicate and stale brace rejected',()=>{
 let s=flight();s=command(s,{run:1,kind:'brace'},player(.55,false),now+610,true);assert.ok(s.motion[who].braceAt)
 assert.equal(command(s,{run:1,kind:'brace'},player(.55,false),now+620,true),s)
 assert.equal(command(s,{run:0,kind:'brace'},player(.55,false),now+620,true),s)
 s=tick(s,[player()],now+800);const landing=s.disturbances.filter(e=>e.kind==='landing');assert.equal(landing.length,1);assert.equal(landing[0].quiet,true);assert.equal(landing[0].radius,0)
 s=tick(s,[player()],now+1000);assert.equal(s.disturbances.filter(e=>e.kind==='landing').length,1);assert.equal(s.enemies[0].mode,'patrol')
})
test('early attempt cannot be retried in same jump; missed landing creates audible event and enemy investigates across occlusion',()=>{
 let s=started();s=tick(s,[player(.3,false)],now+200);s=command(s,{run:1,kind:'brace'},player(.3,false),now+210,true);assert.equal(s.motion[who].braceUsed,true);assert.equal(s.motion[who].braceAt,0)
 s=tick(s,[player(1.4,false)],now+400);s=tick(s,[player(.5,false)],now+600)
 assert.equal(command(s,{run:1,kind:'brace'},player(.5,false),now+610,true),s)
 assert.equal(lineOfSight(s.enemies[0].pos,player().pos),false)
 s=tick(s,[player()],now+800);assert.equal(s.motion[who].lastLanding?.quiet,false);assert.equal(s.enemies[0].mode,'investigate');assert.ok(s.enemies[0].investigate)
 const before=[...s.enemies[0].pos];s=tick(s,[{...player(),pos:[-4,0,9]}],now+1100);assert.notDeepEqual(s.enemies[0].pos,before)
 s=tick(s,[{...player(),pos:[-4,0,9]}],now+8000);assert.equal(s.enemies[0].mode,'patrol')
})
test('host derives footsteps from movement, rate limits, suppresses teleport/special zones and clears state on restart',()=>{
 let m=observeMotion(undefined,{pos:[3,0,7],grounded:true,speed:4},now)
 m=observeMotion(m.motion,{pos:[3,0,6],grounded:true,speed:4},now+500);assert.equal(m.events[0].kind,'run');assert.equal(m.events[0].surface,'sand')
 let next=observeMotion(m.motion,{pos:[3,0,5.8],grounded:true,speed:4},now+600);assert.equal(next.events.length,0)
 next=observeMotion(next.motion,{pos:[-14,-2,-18],grounded:false,speed:4},now+800);assert.equal(next.events.length,0)
 let s=flight();assert.equal(command(s,{run:1,kind:'noise',value:'1000'},player(),now+610,true),s)
 s.phase='lost';s=command(s,{run:1,kind:'restart'},{id:who,pos:[0,0,13]},now+1000,true);assert.deepEqual(s.motion,{});assert.deepEqual(s.disturbances,[]);assert.equal(s.noiseSerial,0)
 s=tick(s,[player()],now+1100);s=tick(s,[],now+1300);assert.deepEqual(s.motion,{})
})
test('hearing applies distance, occlusion and room attenuation; protected players do not attract enemies',()=>{
 const event:Disturbance={id:1,by:who,at:now,pos:[-4,0,0],kind:'landing',surface:'sand',radius:12,quiet:false}
 assert.ok(Math.abs(hearingRange(event,[1.5,0,0])-6.6)<1e-6);assert.equal(hearingRange(event,[-4,0,4]),12)
 let s=started();s.protectedUntil[who]=now+9000;s.disturbances=[event];s.noiseSerial=1;s=tick(s,[player()],now+200);assert.equal(s.enemies[0].mode,'patrol')
})
