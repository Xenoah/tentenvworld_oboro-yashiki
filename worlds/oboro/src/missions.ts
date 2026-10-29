import type { Difficulty, GameState, Player, V3 } from './game'

/** Finite host-owned room progression. Client requests never supply completion, scores or positions. */
export interface MissionState {
 stage:number; attempt:number; openedAt:number; deadline:number; cleared:boolean; failed:boolean;
 progress:number; mistakes:number; lastBeat:number; deliveries:number[]; carried:Record<string,number>;
 charges:number[]; retries:number; notice:string;
}
export const ROOMS = [
 {id:'wood',name:'反射の書院',subtitle:'灯る札を叩け',spawn:[-12,.12,4] as V3,portal:[-17,.12,-3] as V3,bounds:[-19.3,-8.7,-6.3,6.3,-.7,4] as const,seconds:[55,45,35]},
 {id:'fire',name:'跳躍の間',subtitle:'上下の印を往復せよ',spawn:[12,.12,7] as V3,portal:[17,3.42,2.5] as V3,bounds:[9.7,20.3,-3.3,9.3,-.7,7] as const,seconds:[100,85,70]},
 {id:'water',name:'沈み座敷',subtitle:'水底の灯籠を岸へ運べ',spawn:[-14,.12,-12.3] as V3,portal:[-17,.12,-12.2] as V3,bounds:[-19.4,-8.7,-24.7,-11.2,-3.6,4] as const,seconds:[125,105,85]},
 {id:'void',name:'浮遊蔵',subtitle:'三つの星を支えよ',spawn:[0,.12,-16.2] as V3,portal:[0,4.6,-19] as V3,bounds:[-4.6,4.6,-25.3,-14.7,-.7,8] as const,seconds:[95,80,65]},
 {id:'moon',name:'逆さ回廊',subtitle:'光の拍子に壁と天井を渡れ',spawn:[15,.12,-16.5] as V3,portal:[18,5.78,-21] as V3,bounds:[9.3,20.7,-25.3,-14.7,-.7,6.4] as const,seconds:[100,85,70]},
] as const
export const REFLEX:V3[]=[[-11.8,1.2,1],[-13,1.2,1],[-14.2,1.2,1]]
export const JUMP_ROUTE:V3[]=[[16,.08,6.2],[16,3.42,3],[12,.08,7],[17,3.42,2.5]]
export const LANTERNS:V3[]=[[-16,-2.7,-16],[-12,-2.7,-18],[-16,-2.7,-20],[-12,-2.7,-20.5]]
export const WATER_BANK:V3=[-14,.12,-12.3]
export const ANCHORS:V3[]=[[-2,1,-17],[2,2.8,-20],[-2,4.6,-21]]
export const GRAVITY_ROUTE:V3[]=[[10,1.5,-18],[14,5.78,-19],[18,5.78,-21]]
export const FINALE_SPAWN:V3=[0,.12,-10.4]
export const MISSION_LIMIT={easy:720,normal:540,hard:420}
const d=(a:V3,b:V3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])
const level=(difficulty:Difficulty)=>difficulty==='easy'?0:difficulty==='normal'?1:2
export const roomSeconds=(stage:number,difficulty:Difficulty)=>ROOMS[stage]?.seconds[level(difficulty)]??180
export function freshMission(now:number,difficulty:Difficulty,stage=0,attempt=0,retries=0):MissionState {
 return {stage,attempt,openedAt:now,deadline:now+roomSeconds(stage,difficulty)*1000,cleared:false,failed:false,progress:0,mistakes:0,lastBeat:-1,deliveries:[],carried:{},charges:[0,0,0],retries,notice:'目標を確認して挑戦しよう'}
}
export const inMissionRoom=(stage:number,p:V3)=>{
 const b=ROOMS[stage]?.bounds;return !!b&&p.every(Number.isFinite)&&p[0]>=b[0]&&p[0]<=b[1]&&p[2]>=b[2]&&p[2]<=b[3]&&p[1]>=b[4]&&p[1]<=b[5]
}
export function checkpoint(s:GameState):V3 {
 if(s.mode!=='mission')return [0,.1,13]
 if(s.phase==='won')return [0,.1,13]
 const stage=s.phase==='running'?s.mission?.stage??0:0
 return [...(ROOMS[stage]?.spawn??FINALE_SPAWN)] as V3
}
export function reflexBeat(s:GameState,now:number){
 const m=s.mission!,period=[3600,3000,2400][level(s.difficulty)],at=Math.max(0,now-m.openedAt),beat=Math.floor(at/period)
 return {beat,target:((beat*5+(s.seed>>>3))%3),open:at%period>350&&at%period<period-[550,700,850][level(s.difficulty)],period}
}
export const gravityOpen=(s:GameState,now:number)=>(now-(s.mission?.openedAt??0))%4500<[3300,2600,1900][level(s.difficulty)]
export const chargeSeconds=(s:GameState)=>[2,3,4][level(s.difficulty)]
export function gravityPoint(index:number,extended=true):V3 {const p=[...GRAVITY_ROUTE[index]] as V3;if(!extended&&index>0)p[1]=4.3;return p}
/** Standard clients stand on the existing visible footrests; height/range still validated by the host. */
const nearGravity=(p:V3,i:number)=>d(p,gravityPoint(i))<1.05||d(p,gravityPoint(i,false))<1.05
export function missionCommand(s:GameState,p:Player,value:string|undefined,attempt:number|undefined,now:number,host:boolean):boolean {
 const m=s.mission;if(!m||attempt!==m.attempt||typeof value!=='string')return false
 if(value==='retry'){
  if(m.stage>=5||(!m.failed&&!host)||now-m.openedAt<1000)return false
  s.mission=freshMission(now+1500,s.difficulty,m.stage,m.attempt+1,m.retries+1);s.mission.notice='この部屋から再挑戦。達成済みの部屋は保持';return true
 }
 if(m.failed||now<m.openedAt||!inMissionRoom(m.stage,p.pos))return false
 if(value==='next'){
  if(!m.cleared||d(p.pos,ROOMS[m.stage].portal)>3.3)return false
  s.mission=freshMission(now+1500,s.difficulty,m.stage+1,m.attempt+1,m.retries)
  for(const id of s.roster)s.protectedUntil[id]=now+10000
  return true
 }
 if(m.cleared)return false
 if(m.stage===0&&/^hit:[0-2]$/.test(value)){
  const n=Number(value.slice(4));if(d(p.pos,REFLEX[n])>3.1)return false
  const beat=reflexBeat(s,now);if(m.lastBeat===beat.beat)return false
  m.lastBeat=beat.beat
  if(beat.open&&n===beat.target){m.progress++;m.notice=`成功 ${m.progress}/5 — 次の光を待とう`}
  else {m.progress=0;m.mistakes++;m.notice='空振り。札が光ってから叩こう';if(m.mistakes>=3){m.failed=true;m.notice='三度の空振り。この部屋から再挑戦'}}
  return true
 }
 if(m.stage===2&&/^take:[0-3]$/.test(value)){
  const n=Number(value.slice(5));if(d(p.pos,LANTERNS[n])>1.8||m.deliveries.includes(n)||Object.values(m.carried).includes(n)||p.id in m.carried)return false
  m.carried[p.id]=n;m.notice='灯籠を持った。岸の受け台へ戻ろう';return true
 }
 return false
}
/** Called with host-observed poses and capped simulation dt; it never trusts client progress. */
export function tickMission(s:GameState,players:Player[],now:number,dt:number):boolean {
 const m=s.mission;if(!m||m.stage>=5||m.cleared||m.failed||now<m.openedAt)return false
 if(now>=m.deadline){m.failed=true;m.notice='部屋の制限時間。再挑戦で入口へ';m.carried={};return false}
 const present=players.filter(p=>!s.jailed[p.id]&&inMissionRoom(m.stage,p.pos))
 for(const id of Object.keys(m.carried))if(!players.some(p=>p.id===id))delete m.carried[id]
 if(m.stage===1){const at=JUMP_ROUTE[m.progress];if(at&&present.some(p=>p.grounded===true&&d(p.pos,at)<.95)){m.progress++;m.notice=`足場 ${m.progress}/4 — ${m.progress%2?'上の印へ':'床の印へ'}`}}
 if(m.stage===2){
  // Touch events can arrive before the sender's next pose packet. Observe contact on
  // the host as well, so a valid remote arrival is not lost to packet ordering.
  for(const p of present){
   if(!(p.id in m.carried)){
    const n=LANTERNS.findIndex((point,i)=>d(p.pos,point)<1.8&&!m.deliveries.includes(i)&&!Object.values(m.carried).includes(i))
    if(n>=0){m.carried[p.id]=n;m.notice='灯籠を持った。岸の受け台へ戻ろう'}
   }
   if(p.id in m.carried&&d(p.pos,WATER_BANK)<1.7){m.deliveries.push(m.carried[p.id]);delete m.carried[p.id];m.progress=m.deliveries.length;m.notice=`灯籠 ${m.progress}/4 を運び戻した`}
  }
 }
 if(m.stage===3){for(let i=0;i<3;i++){if(m.charges[i]>=chargeSeconds(s))continue;if(present.some(p=>d(p.pos,ANCHORS[i])<1.05))m.charges[i]=Math.min(chargeSeconds(s),m.charges[i]+dt);else m.charges[i]=Math.max(0,m.charges[i]-dt*.35)}m.progress=m.charges.filter(v=>v>=chargeSeconds(s)).length;m.notice=`星 ${m.progress}/3 — 光の中心で止まろう`}
 if(m.stage===4&&gravityOpen(s,now)&&m.progress<3&&present.some(p=>nearGravity(p.pos,m.progress))){m.progress++;m.notice=`重力の印 ${m.progress}/3 — 次の拍子へ`}
 const target=[5,4,4,3,3][m.stage]
 if(m.progress>=target){m.cleared=true;m.notice='達成！ 開いた歪みの扉へ';return true}
 return false
}
export function missionObjective(s:GameState,p:V3,id?:string):{pos:V3;label:string}|null {
 const m=s.mission;if(!m||s.phase!=='running')return null
 if(m.stage>=5)return {pos:[0,.1,16.4],label:'庭を抜け、最後の門へ。忍者に注意'}
 if(m.failed)return {pos:ROOMS[m.stage].spawn,label:'再挑戦ボタンでこの部屋をやり直す'}
 if(m.cleared)return {pos:ROOMS[m.stage].portal,label:'歪みの扉へ — 全員で次の部屋へ'}
 if(m.stage===0)return {pos:REFLEX[reflexBeat(s,s.updatedAt).target],label:'光った札だけを叩く（5回）'}
 if(m.stage===1)return {pos:JUMP_ROUTE[m.progress],label:m.progress%2?'跳躍台から上の印へ':'床の印に着地する'}
 if(m.stage===2){if(id&&id in m.carried)return {pos:WATER_BANK,label:'岸の受け台に灯籠を届ける'};const choices=LANTERNS.map((pos,i)=>({pos,i})).filter(v=>!m.deliveries.includes(v.i)&&!Object.values(m.carried).includes(v.i)).sort((a,b)=>d(a.pos,p)-d(b.pos,p));return {pos:choices[0]?.pos??WATER_BANK,label:'水中の灯籠に触れて運ぶ（1人1個）'}}
 if(m.stage===3){const i=m.charges.findIndex(v=>v<chargeSeconds(s));return {pos:ANCHORS[Math.max(0,i)],label:`星の中心で ${chargeSeconds(s)} 秒静止。分担も可能`}}
 return {pos:GRAVITY_ROUTE[Math.min(2,m.progress)],label:gravityOpen(s,s.updatedAt)?'光の拍子！ 次の印へ':'待つ — 次の光の拍子に進む'}
}
