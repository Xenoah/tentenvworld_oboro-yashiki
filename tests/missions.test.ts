import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ACTIONS,command,initialState,tick,type GameState,type Player,type V3} from '../worlds/oboro/src/game'
import {ANCHORS,checkpoint,chargeSeconds,gravityOpen,GRAVITY_ROUTE,JUMP_ROUTE,LANTERNS,REFLEX,reflexBeat,ROOMS,WATER_BANK} from '../worlds/oboro/src/missions'
let now=1000000
const actor=(pos:V3,id='host'):Player=>({id,pos,grounded:true,yaw:0})
function start(){now=1000000;const s=command(initialState(0,'normal','mission'),{run:0,kind:'start'},actor(ROOMS[0].spawn),now,true);now=s.startedAt+500;return tick(s,[actor(ROOMS[0].spawn)],now)}
const cmd=(s:GameState,value:string,pos:V3,id='host',host=true,attempt=s.mission!.attempt)=>command(s,{run:s.run,kind:'mission',value,seq:attempt},actor(pos,id),now,host)
const step=(s:GameState,pos:V3,id='host')=>{now+=200;return tick(s,[actor(pos,id)],now)}
function clear(s:GameState):GameState{
 const m=s.mission!
 if(m.stage===0){for(let i=0;i<5;i++){now=m.openedAt+i*reflexBeat(s,now).period+800;const b=reflexBeat(s,now);s=cmd(s,`hit:${b.target}`,REFLEX[b.target]);s=step(s,ROOMS[0].spawn)}}
 if(m.stage===1){now=m.openedAt+200;for(const p of JUMP_ROUTE)s=step(s,p)}
 if(m.stage===2){now=m.openedAt+200;for(let i=0;i<4;i++){s=cmd(s,`take:${i}`,LANTERNS[i]);s=step(s,WATER_BANK)}}
 if(m.stage===3){now=m.openedAt+200;for(const p of ANCHORS)for(let j=0;j<22;j++)s=step(s,p)}
 if(m.stage===4){now=m.openedAt+200;for(const p of GRAVITY_ROUTE){while(!gravityOpen(s,now))now+=200;s=step(s,p)}}
 assert.equal(s.mission?.cleared,true,`room ${m.stage} should complete`);return s
}
function next(s:GameState){s=cmd(s,'next',ROOMS[s.mission!.stage].portal);now=s.mission!.openedAt+200;return s}
test('indoor mission route is solo-solvable in order, awards each room once, opens the garden and restarts cleanly',()=>{
 let s=start();assert.deepEqual(checkpoint(s),ROOMS[0].spawn)
 for(let stage=0;stage<5;stage++){assert.equal(s.mission!.stage,stage);s=clear(s);assert.equal(s.keys.length,stage+1);const points=s.score;s=step(s,ROOMS[stage].portal);assert.equal(s.score,points);s=next(s)}
 assert.equal(s.mission!.stage,5);assert.equal(s.keys.length,5)
 s=command(s,{run:s.run,kind:'exit'},actor(ACTIONS.exit),now,true);assert.equal(s.phase,'won');assert.ok(s.score>10000)
 const end=s;assert.equal(command(s,{run:s.run,kind:'mission',value:'retry',seq:s.mission!.attempt},actor(ROOMS[0].spawn),now,true),end)
 s=command(s,{run:s.run,kind:'restart'},actor(checkpoint(s)),now,true);assert.equal(s.phase,'running');assert.equal(s.mission!.stage,0);assert.deepEqual(s.keys,[]);assert.equal(s.mission!.retries,0);assert.equal(s.mission!.attempt,0)
})
test('room authority rejects old attempts, distant/reflex duplicates, premature portals and legacy seal shortcuts',()=>{
 let s=start(),b=reflexBeat(s,now);assert.equal(cmd(s,'next',ROOMS[0].portal),s)
 assert.equal(cmd(s,`hit:${b.target}`,[0,0,0]),s);assert.equal(cmd(s,`hit:${b.target}`,REFLEX[b.target],'host',true,77),s)
 assert.equal(command(s,{run:s.run,kind:'key:fire'},actor([16,4,3]),now,true),s)
 s=cmd(s,`hit:${b.target}`,REFLEX[b.target]);assert.equal(s.mission!.progress,1);assert.equal(cmd(s,`hit:${b.target}`,REFLEX[b.target]),s)
 s=clear(start());s=next(s);assert.equal(cmd(s,'hit:0',REFLEX[0]),s)
})
test('failed room retry preserves earlier rooms, clears only the current attempt and prevents stale replay',()=>{
 let s=next(clear(start()));s=step(s,JUMP_ROUTE[0]);const epoch=s.mission!.attempt,keys=[...s.keys]
 now=s.mission!.deadline+1;s=tick(s,[actor(ROOMS[1].spawn)],now);assert.equal(s.mission!.failed,true);assert.equal(s.phase,'running')
 s=cmd(s,'retry',ROOMS[1].spawn);assert.equal(s.mission!.stage,1);assert.equal(s.mission!.attempt,epoch+1);assert.deepEqual(s.keys,keys);assert.equal(s.mission!.progress,0);assert.equal(s.mission!.retries,1)
 assert.equal(cmd(s,'retry',ROOMS[1].spawn,'host',true,epoch),s)
})
test('water carrying supports cooperative delivery, rejects duplicate pickup and releases disconnected carriers',()=>{
 let s=next(clear(next(clear(start()))));now=s.mission!.openedAt+200;s=tick(s,[actor(LANTERNS[0]),actor(LANTERNS[1],'guest')],now)
 s=cmd(s,'take:0',LANTERNS[0]);assert.equal(cmd(s,'take:0',LANTERNS[0],'guest',false),s)
 s=cmd(s,'take:1',LANTERNS[1],'guest',false);assert.equal(Object.keys(s.mission!.carried).length,2)
 now+=200;s=tick(s,[actor(WATER_BANK),actor(WATER_BANK,'guest')],now);assert.deepEqual(s.mission!.deliveries,[0,1]);assert.equal(s.mission!.progress,2)
 s=cmd(s,'take:2',LANTERNS[2],'guest',false);now+=200;s=tick(s,[actor(ROOMS[2].spawn)],now);assert.equal(s.mission!.carried.guest,undefined)
 s=cmd(s,'take:2',LANTERNS[2]);assert.equal(s.mission!.carried.host,2)
})
test('floating stars use elapsed occupancy, support parallel teammates, retain completed stars and survive host handoff snapshot',()=>{
 let s=start();for(let i=0;i<3;i++)s=next(clear(s));now=s.mission!.openedAt+200
 const players=ANCHORS.map((p,i)=>actor(p,i===0?'host':`guest${i}`))
 for(let i=0;i<4;i++){now+=200;s=tick(s,players,now)}assert.equal(s.mission!.cleared,false);assert.ok(s.mission!.charges.every(v=>v<chargeSeconds(s)))
 s=structuredClone(s) // Receiver/new host snapshot; no success values injected.
 for(let i=0;i<20;i++){now+=200;s=tick(s,players,now)}assert.equal(s.mission!.cleared,true);assert.equal(s.keys.length,4)
 const charges=[...s.mission!.charges];now+=200;s=tick(s,[actor(ROOMS[3].spawn,'guest1')],now);assert.deepEqual(s.mission!.charges,charges)
})
test('gravity checkpoints require the current beat and route; wrong room poses never advance',()=>{
 let s=start();for(let i=0;i<4;i++)s=next(clear(s));now=s.mission!.openedAt+3500
 s=tick(s,[actor(GRAVITY_ROUTE[0])],now);assert.equal(s.mission!.progress,0)
 now=s.mission!.openedAt+4600;s=tick(s,[actor(GRAVITY_ROUTE[2])],now);assert.equal(s.mission!.progress,0)
 s=step(s,GRAVITY_ROUTE[0]);assert.equal(s.mission!.progress,1)
 s=step(s,[0,0,0]);assert.equal(s.mission!.progress,1)
})

test('remote contact is recovered from the host pose after an early pickup packet, with one carrier per lantern',()=>{
 let s=next(clear(next(clear(start()))));now=s.mission!.openedAt+200
 s=tick(s,[actor(WATER_BANK),actor(WATER_BANK,'guest')],now)
 assert.equal(cmd(s,'take:0',WATER_BANK,'guest',false),s,'early packet at old pose must remain rejected')
 now+=200;s=tick(s,[actor(LANTERNS[0],'guest'),actor(LANTERNS[0])],now)
 assert.equal(s.mission!.carried.guest,0);assert.equal(s.mission!.carried.host,undefined)
 assert.equal(cmd(s,'take:0',LANTERNS[0]),s,'second claimant cannot duplicate a host-observed pickup')
 now+=200;s=tick(s,[actor(WATER_BANK,'guest'),actor(WATER_BANK)],now)
 assert.deepEqual(s.mission!.deliveries,[0]);assert.equal(s.mission!.progress,1)
})
