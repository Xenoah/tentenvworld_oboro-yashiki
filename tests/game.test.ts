import {test} from 'node:test'
import assert from 'node:assert/strict'
import {initialState, command, tick, KEYS, ACTIONS, DIFFICULTIES, COUNTDOWN, remaining, lineOfSight, actionPos, layoutOf, type GameState, type Player, type V3} from '../worlds/oboro/src/game.ts'
const t0=1_000_000
const p:Player={id:'host',pos:[0,0,12]}
const start=(difficulty:'easy'|'normal'|'hard'='normal')=>command(initialState(0,difficulty),{run:0,kind:'start'},p,t0,true)
const act=(s:GameState,kind:string,pos:V3=actionPos(s,kind)!,id='host',host=true)=>command(s,{run:s.run,kind},{id,pos},t0+5000,host)
function solve(s:GameState){
  const l=layoutOf(s)
  for(const kind of [...l.runeOrder.map(r=>`rune:${r}`),'valve:0','valve:1',...l.starOrder.map(i=>`star:${i}`)])s=act(s,kind)
  for(const k of KEYS)s=act(s,`key:${k.id}`)
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
 let s=start();assert.equal(act(s,'key:wood'),s)
 s=solve(s);const points=s.score;const dup=act(s,'key:fire');assert.equal(dup,s);assert.equal(dup.score,points)
})
test('sequence is solo solvable and wrong rune resets; stars enforce order',()=>{
 let s=start();const l=layoutOf(s),[a,b,c]=l.runeOrder;s=act(s,`rune:${a}`);s=act(s,`rune:${c}`);assert.equal(s.rune,0)
 assert.equal(act(s,`star:${l.starOrder[2]}`),s);for(const k of [a,b,c])s=act(s,`rune:${k}`);assert.equal(s.door,true)
})
test('each round reshuffles runes, stars, valves, seals and coins deterministically from its seed',async()=>{
 const {layoutFor}=await import('../worlds/oboro/src/layout.ts')
 const seeds=Array.from({length:40},(_,i)=>layoutFor(i*7919+3))
 assert.ok(new Set(seeds.map(l=>l.runeOrder.join())).size>3);assert.ok(new Set(seeds.map(l=>l.starOrder.join())).size>3)
 assert.ok(new Set(seeds.map(l=>l.valves.join())).size>3);assert.ok(new Set(seeds.map(l=>JSON.stringify(l.keyPos.water))).size>1)
 assert.deepEqual(layoutFor(12345),layoutFor(12345));assert.deepEqual(layoutFor(0).runeOrder,['moon','wave','pine'])
 const r1=start(),r2=command(act(act(solve(start()),'exit'),'restart',p.pos),{run:0,kind:'noop'},p,t0,true);assert.notEqual(r1.seed,0);assert.notEqual(r2.seed,r1.seed)
 let s=start();const coin=layoutOf(s).coins[0];s=act(s,'coin:0');assert.deepEqual(s.coins,[0]);assert.equal(s.coinPoints,coin.value);assert.equal(act(s,'coin:0'),s)
 assert.equal(act(s,'coin:1',[0,0,30]),s)
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
test('attack has windup, requires range and clear sight; retreat cancels (上忍 capture ends the run)',()=>{
 let s=start('hard');s.protectedUntil.host=0;s.updatedAt=t0+20000;s.enemies[0].pos=[6,0,0]
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
test('casual capture: 見習い/忍び send the caught player to the cell; a teammate or the timer frees them',async()=>{
 const {JAIL_TIME,JAIL_TIME_TEAM,JAIL_LOCK,CAPTURE_PENALTY}=await import('../worlds/oboro/src/game.ts')
 const catchAt=(s:GameState,players:Player[],at:number)=>{s.enemies[0]={pos:[6,0,0],target:null,alertAt:0,waypoint:0,mode:'patrol',yaw:0};s.enemies[1].pos=[-8,0,-9];for(const pl of players)s.protectedUntil[pl.id]=0;s.updatedAt=at
   s=tick(s,players,at+200);return tick(s,players,at+200+(DIFFICULTIES[s.difficulty].windup+.5)*1000)}
 const me:Player={id:'host',pos:[6,0,.8]};let s=catchAt(start('easy'),[me],t0+20000)
 assert.equal(s.phase,'running');assert.ok(s.jailed.host);assert.equal(s.captures,1)
 assert.equal(command(s,{run:s.run,kind:'key:fire'},{id:'host',pos:actionPos(s,'key:fire')!},t0+24000,true),s,'jailed players cannot act')
 s=tick(s,[{id:'host',pos:[-15.6,0,10]}],s.jailed.host+1);assert.equal(s.jailed.host,undefined,'solo auto release')
 const solved=act(solve(start('easy')),'exit');const penal=act(solve(catchAt(start('easy'),[me],t0+20000)),'exit')
 assert.ok(solved.score-penal.score>=CAPTURE_PENALTY-1)
 let t=catchAt(start('normal'),[me,{id:'guest',pos:[0,0,12]}],t0+20000);assert.ok(t.jailed.host-(t0+20000)>JAIL_TIME.normal,'team cell waits for a rescuer')
 assert.ok(t.jailed.host<=t0+23000+JAIL_TIME_TEAM)
 t=command(t,{run:t.run,kind:'free'},{id:'guest',pos:[JAIL_LOCK[0]+.5,0,JAIL_LOCK[2]]},t0+25000,false);assert.deepEqual(t.jailed,{})
})
test('疾風 mode: three random rooms, three minutes, gate opens with those seals only',async()=>{
 const {MODES,required,timeLimit}=await import('../worlds/oboro/src/game.ts')
 let s=command(initialState(0,'normal'),{run:0,kind:'mode',value:'sprint'},p,t0,true);s=command(s,{run:0,kind:'start'},p,t0,true)
 assert.equal(s.mode,'sprint');assert.equal(timeLimit(s),MODES.sprint.limit);const need=required(s);assert.equal(need.length,3)
 const other=KEYS.map(k=>k.id).find(id=>!need.includes(id))!;s=solve(s);assert.equal(s.keys.length,3);assert.ok(!s.keys.includes(other))
 assert.equal(act(s,`key:${other}`),s);s=act(s,'exit');assert.equal(s.phase,'won')
 s=act(s,'restart',p.pos);assert.equal(s.mode,'sprint')
})
