import {test} from 'node:test'
import assert from 'node:assert/strict'
import {initialState, command, tick, KEYS, ACTIONS, DIFFICULTIES, COUNTDOWN, remaining, lineOfSight, type GameState, type Player, type V3} from '../worlds/oboro/src/game.ts'
const t0=1_000_000
const p:Player={id:'host',pos:[0,0,12]}
const start=(difficulty:'easy'|'normal'|'hard'='normal')=>command(initialState(0,difficulty),{run:0,kind:'start'},p,t0,true)
const act=(s:GameState,kind:string,pos:V3=ACTIONS[kind],id='host',host=true)=>command(s,{run:s.run,kind},{id,pos},t0+5000,host)
function solve(s:GameState){
  for(const kind of ['rune:moon','rune:wave','rune:pine','valve:0','valve:1','star:0','star:1','star:2'])s=act(s,kind)
  for(const k of KEYS)s=act(s,`key:${k.id}`,k.pos)
  return s
}
test('one player can finish all five sections, escape and restart',()=>{
 let s=solve(start());assert.equal(s.keys.length,5);s=act(s,'exit');assert.equal(s.phase,'won');assert.ok(s.score>10000)
 const old=s.run;s=act(s,'restart',p.pos);assert.equal(s.phase,'running');assert.equal(s.run,old+1);assert.deepEqual(s.keys,[]);assert.equal(s.door,false);assert.equal(s.recoveries,0)
})
test('host start only, distance and round reject stale/spoofed/out-of-range commands',()=>{
 const lobby=initialState();assert.equal(command(lobby,{run:0,kind:'start'},p,t0,false),lobby)
 const s=start();assert.equal(command(s,{run:0,kind:'rune:moon'},p,t0,true),s)
 assert.equal(act(s,'rune:moon',[0,0,0]),s);assert.equal(act(s,'rune:evil',[NaN,0,0]),s)
 assert.equal(act(s,'rune:evil',[0,0,0]),s);assert.equal(act(s,'valve:900',[0,0,0]),s)
})
test('keys are shared, duplicate pickup is idempotent, gated keys cannot bypass puzzles',()=>{
 let s=start();const wood=KEYS[0];assert.equal(act(s,'key:wood',wood.pos),s)
 s=solve(s);const points=s.score;const dup=act(s,'key:fire',KEYS[1].pos);assert.equal(dup,s);assert.equal(dup.score,points)
})
test('sequence is solo solvable and wrong rune resets; stars enforce order',()=>{
 let s=start();s=act(s,'rune:moon');s=act(s,'rune:pine');assert.equal(s.rune,0)
 assert.equal(act(s,'star:2'),s);for(const k of ['rune:moon','rune:wave','rune:pine'])s=act(s,k);assert.equal(s.door,true)
})
test('late join gets shared snapshot, spawn protection, disconnect prunes, host migration keeps state',()=>{
 let s=solve(start());s=tick(s,[p,{id:'guest',pos:[0,0,12]}],t0+4000);assert.equal(s.keys.length,5);assert.equal(s.roster.length,2)
 assert.equal(s.protectedUntil.guest,t0+16000)
 s=tick(s,[{id:'guest',pos:[0,0,12]}],t0+4500);assert.equal(s.keys.length,5);assert.equal(s.roster.length,1);assert.equal(s.protectedUntil.host,undefined)
 s=command(s,{run:s.run,kind:'exit'},{id:'guest',pos:ACTIONS.exit},t0+4600,true);assert.equal(s.phase,'won')
})
test('terminal outcome cannot be overwritten by attacks or later commands',()=>{
 const won=act(solve(start()),'exit');assert.equal(tick(won,[p],t0+2_000_000),won)
 let lost=tick(start(),[p],t0+COUNTDOWN+DIFFICULTIES.normal.limit*1000+1);assert.equal(lost.phase,'lost')
 assert.equal(act(lost,'exit'),lost);assert.equal(act(won,'key:wood',KEYS[0].pos),won)
})
test('attack has windup, requires range and clear sight; retreat cancels',()=>{
 let s=start();s.protectedUntil.host=0;s.updatedAt=t0+20000;s.enemies[0].pos=[6,0,0]
 const target:Player={id:'host',pos:[6,0,.8]};s=tick(s,[target],t0+20200);assert.equal(s.phase,'running');assert.equal(s.enemies[0].mode,'warning')
 s=tick(s,[{id:'host',pos:[6,0,10]}],t0+23000);assert.equal(s.phase,'running');assert.equal(s.enemies[0].mode,'patrol')
 s.enemies[0].pos=[6,0,0];s=tick(s,[target],t0+24000);s=tick(s,[target],t0+26500);assert.equal(s.phase,'lost')
 assert.equal(lineOfSight([-4,0,0],[2,0,0]),false);assert.equal(lineOfSight([6,0,0],[6,0,3]),true)
})
test('recovery is penalized once per cooldown; max four active players and bounded JSON',()=>{
 let s=start();s.updatedAt=t0+20000;s.protectedUntil.host=0
 s=command(s,{run:s.run,kind:'recover'},p,t0+20000,true);assert.equal(s.recoveries,1)
 assert.equal(command(s,{run:s.run,kind:'recover'},p,t0+20000,true),s)
 s=tick(s,Array.from({length:7},(_,i)=>({id:`p${i}`,pos:[0,0,12] as V3})),t0+21000)
 assert.equal(s.roster.length,4);assert.ok(JSON.stringify(s).length<16384)
})
test('difficulty changes scoring and deadlines; no mid-run changes',()=>{
 const easy=act(solve(start('easy')),'exit'),hard=act(solve(start('hard')),'exit');assert.ok(hard.score>easy.score)
 const s=start();assert.equal(command(s,{run:s.run,kind:'difficulty',value:'hard'},p,t0,true),s)
})
test('time attack: 3-2-1 lead-in blocks play, seals add time and record splits',()=>{
 const s0=start('normal');assert.equal(s0.startedAt,t0+COUNTDOWN)
 assert.equal(command(s0,{run:s0.run,kind:'key:fire'},{id:'host',pos:KEYS[1].pos},t0+1000,true),s0)
 assert.equal(tick(s0,[p],t0+1000).phase,'running');assert.equal(remaining(s0,t0+1000),DIFFICULTIES.normal.limit)
 const s1=command(s0,{run:s0.run,kind:'key:fire'},{id:'host',pos:KEYS[1].pos},t0+COUNTDOWN+42_000,true)
 assert.deepEqual(s1.splits,[{id:'fire',t:42}]);assert.equal(s1.bonus,DIFFICULTIES.normal.bonus)
 assert.equal(remaining(s1,t0+COUNTDOWN+42_000),DIFFICULTIES.normal.limit+DIFFICULTIES.normal.bonus-42)
 assert.equal(tick(s1,[p],t0+COUNTDOWN+(DIFFICULTIES.normal.limit+5)*1000).phase,'running')
 assert.equal(tick(s1,[p],t0+COUNTDOWN+(DIFFICULTIES.normal.limit+DIFFICULTIES.normal.bonus)*1000+1).phase,'lost')
})
test('ninjas see a forward cone (plus close range); byobu blocks sight; smoke stuns',async()=>{
 const {inView,SMOKE_SPOTS}=await import('../worlds/oboro/src/game.ts')
 const e={pos:[0,0,0] as V3,target:null,alertAt:0,waypoint:0,mode:'patrol' as const,yaw:0}
 assert.equal(inView(e,[0,0,5],110),true);assert.equal(inView(e,[0,0,-5],110),false);assert.equal(inView(e,[0,0,-1],110),true)
 assert.equal(lineOfSight([3,0,1],[3,0,5]),false)
 let s=start();s.updatedAt=t0+20000;s.protectedUntil.host=0;s.enemies[0]={pos:[6,0,0],target:null,alertAt:0,waypoint:0,mode:'patrol',yaw:Math.PI}
 s.enemies[1].pos=[-8,0,-9]
 s=tick(s,[{id:'host',pos:[6,0,4]}],t0+20200);assert.equal(s.enemies[0].target,null,'behind the ninja: unseen')
 s.enemies[0].yaw=0;s=tick(s,[{id:'host',pos:[6,0,4]}],t0+20400);assert.equal(s.enemies[0].target,'host')
 const take=(st:GameState,i:number,pos:V3=SMOKE_SPOTS[i])=>command(st,{run:st.run,kind:`smoke:take:${i}`},{id:'host',pos},t0+20500,true)
 assert.equal(take(s,0,[0,0,12]),s);s=take(s,0);assert.equal(s.held.host,1);assert.equal(take(s,0),s)
 s=command(s,{run:s.run,kind:'smoke:use'},{id:'host',pos:[6,0,3]},t0+20600,true);assert.equal(s.held.host,0);assert.equal(s.clouds.length,1)
 s=tick(s,[{id:'host',pos:[6,0,1.2]}],t0+21000);assert.equal(s.enemies[0].mode,'stunned');assert.equal(s.phase,'running')
 assert.equal(command(s,{run:s.run,kind:'smoke:use'},{id:'host',pos:[6,0,3]},t0+21000,true),s,'no bomb left')
 s=tick(s,[{id:'host',pos:[6,0,1.2]}],t0+20600+3100);assert.notEqual(s.enemies[0].mode,'stunned')
})
