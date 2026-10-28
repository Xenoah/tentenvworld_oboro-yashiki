import { test } from 'node:test'
import assert from 'node:assert/strict'
import { command, initialState, tick, DIFFICULTIES, ACTIONS, type GameState, type Player } from '../worlds/oboro/src/game'
import { COMBAT, freshVital, NINJA_DAMAGE } from '../worlds/oboro/src/combat'
const t=1_000_000,p:Player={id:'a',pos:[6,0,1],yaw:0,grounded:true,speed:0}
function start(d:'easy'|'normal'|'hard'='normal') {let s=command(initialState(0,d),{run:0,kind:'start'},{...p,pos:[0,0,12]},t,true);s.enemies[0]={pos:[6,0,-1],target:null,alertAt:0,waypoint:0,mode:'patrol'};s.enemies[1].pos=[-8,0,-8];return s}
const attack=(s:GameState,seq:number,at=t+5000,who=p)=>command(s,{run:s.run,kind:'attack',seq},who,at,false)
test('host melee uses actual facing, range, clear sight and height; miss still costs stamina',()=>{
 let s=attack(start(),1);assert.equal(s.enemies[0].guard,60);assert.equal(s.vitals.a.stamina,78);assert.equal(s.strikes[0].hit,0)
 for(const who of [{...p,yaw:Math.PI},{...p,pos:[6,0,2] as [number,number,number]},{...p,pos:[6,3,1] as [number,number,number]}]){s=attack(start(),1,t+5000,who);assert.equal(s.enemies[0].guard,undefined);assert.equal(s.strikes[0].hit,null);assert.equal(s.vitals.a.stamina,78)}
 s=start();s.enemies[0].pos=[3,0,2];s=attack(s,1,t+5000,{...p,pos:[3,0,4],yaw:0});assert.equal(s.strikes[0].hit,null,'screen blocks sword')
 assert.equal(attack(start(),1,t+5000,{...p,yaw:NaN}).combatSerial,0)
})
test('replayed, stale, forged and cooldown attacks cannot repeat damage or spend; nonmember cannot attack',()=>{
 let s=attack(start(),1);for(const seq of [1,0,-1,NaN,Infinity,1.2])assert.equal(attack(s,seq,t+6000),s)
 assert.equal(attack(s,2,t+5200),s);assert.equal(attack(s,2,t+6000,{...p,id:'stranger'}),s)
 assert.equal(command(s,{run:s.run-1,kind:'attack',seq:2},p,t+6000,true),s)
 const forged={run:s.run,kind:'attack',seq:2,target:1,damage:9999,pos:[-8,0,-8]}
 s=command(s,forged,p,t+6000,false);assert.equal(s.enemies[0].guard,20);assert.equal(s.enemies[1].guard,undefined)
 assert.equal(attack(start(),1,t+1000).combatSerial,0,'countdown')
})
test('three wood strikes stagger then open an eight-second escape window without kill points',()=>{
 let s=start();for(let i=1;i<=3;i++)s=attack(s,i,t+4000+i*800)
 assert.equal(s.enemies[0].guard,0);assert.equal(s.enemies[0].mode,'stunned');assert.equal(s.score,0)
 assert.equal(s.enemies[0].stunUntil,t+6400+COMBAT.retreat)
 s.held.a=1;s=command(s,{run:s.run,kind:'smoke:use'},p,t+6500,false);assert.equal(s.enemies[0].stunUntil,t+6400+COMBAT.retreat,'smoke must not shorten an existing guard break')
 s.startedAt=t-20000;s.protectedUntil.a=t+30000;s.updatedAt=t+6400
 s=tick(s,[p],t+7000);assert.equal(s.enemies[0].guard,0)
 s=tick(s,[p],t+15000);assert.equal(s.enemies[0].guard,100)
})
test('sprinting drains only observed ground movement, exhaustion recovers with hysteresis, teleports do not drain',()=>{
 let s=start();s.protectedUntil.a=t+60000;s.updatedAt=t+4000
 for(let i=0;i<80;i++){const now=t+4200+i*200;s=tick(s,[{...p,pos:[6,0,7-i*.8],speed:4}],now)}
 assert.ok(s.vitals.a.exhausted||s.vitals.a.stamina<COMBAT.recover)
 s.vitals.a={...freshVital(),stamina:0,exhausted:true,spentAt:s.updatedAt}
 let at=s.updatedAt;for(let i=1;i<=20;i++)s=tick(s,[{...p,pos:[0,0,12],speed:0}],at+i*200)
 assert.equal(s.vitals.a.exhausted,false);assert.ok(s.vitals.a.stamina>=30)
 s.vitals.a=freshVital();s=tick(s,[{...p,pos:[100,0,12],speed:100}],s.updatedAt+200);assert.equal(s.vitals.a.stamina,100)
 s.vitals.a.stamina=10;assert.equal(attack(s,50,s.updatedAt+1000),s)
})
test('ninja damage is difficulty-based, has a windup and shared invulnerability, captures only at zero HP',()=>{
 for(const difficulty of ['easy','normal','hard'] as const){
 let s=start(difficulty);s.startedAt=t-20000;s.updatedAt=t;s.protectedUntil.a=0
 s.enemies[0].pos=[6,0,.2];s.enemies[1]={...s.enemies[0],pos:[6.2,0,.2]}
 s=tick(s,[p],t+200);const first=t+200+DIFFICULTIES[difficulty].windup*1000+1
 s=tick(s,[p],first);assert.equal(s.vitals.a.hp,100-NINJA_DAMAGE[difficulty],'two ninjas cannot stack same-tick hits')
 if(difficulty==='hard'){assert.equal(s.phase,'lost');assert.equal(tick(s,[p],first+10000),s);continue}
 assert.equal(s.phase,'running');assert.deepEqual(s.jailed,{})
 s=tick(s,[p],first+100);assert.equal(s.vitals.a.hp,100-NINJA_DAMAGE[difficulty])
 let now=first;for(let i=0;i<60&&!s.jailed.a;i++){now+=200;s=tick(s,[p],now)}
 assert.equal(s.vitals.a.hp,0);assert.ok(s.jailed.a);assert.equal(s.captures,1)
 assert.equal(attack(s,3,now+1000),s,'jailed cannot fight')
 s=tick(s,[{...p,pos:[-15.6,0,10]}],s.jailed.a+1);assert.equal(s.vitals.a.hp,100);assert.equal(s.vitals.a.stamina,100)
 }
})
test('rescue restores health but not replay permission; join/migration retain living stats; restart clears combat',()=>{
 let s=attack(start(),1);s.vitals.a.hp=0;s.jailed.a=t+60000;s.roster.push('b');s.vitals.b={...freshVital(),hp:50}
 s=command(s,{run:s.run,kind:'free'},{id:'b',pos:ACTIONS.free},t+6000,false);assert.equal(s.vitals.a.hp,100);assert.equal(s.vitals.a.attackSeq,1);assert.equal(attack(s,1,t+7000),s)
 s=tick(s,[{id:'b',pos:[0,0,12]},{id:'c',pos:[0,0,12]}],t+8000);assert.equal(s.vitals.b.hp,50);assert.equal(s.vitals.c.hp,100);assert.equal(s.vitals.a,undefined)
 s=tick(s,[{id:'b',pos:[0,0,12]}],t+900000);assert.equal(s.phase,'lost')
 s=command(s,{run:s.run,kind:'restart'},{id:'b',pos:[0,0,12]},t+900001,true)
 assert.deepEqual(s.vitals,{b:freshVital()});assert.deepEqual(s.strikes,[]);assert.equal(s.combatSerial,0);assert.ok(s.enemies.every(e=>e.guard===undefined))
})
