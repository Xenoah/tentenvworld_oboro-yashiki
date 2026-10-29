import assert from 'node:assert/strict'
export const wait=(p,fn,arg=null,timeout=60000)=>p.waitForFunction(fn,arg,{timeout,polling:75})
export const state=p=>p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game'))
export const id=p=>p.evaluate(()=>window.__ttvEngine.runtime.self().peerId)
export async function tp(p,pos,yaw=0,reset=true){await p.evaluate(({pos,yaw,reset})=>{const e=window.__ttvEngine;if(reset){e.runtime.events.emit('oboro:surface-local',{mode:'floor'},e.runtime.self().peerId);e.runtime.locomotion?.set(null)}e.runtime.teleport(pos,yaw);e.player.pitch=0},{pos,yaw,reset});await wait(p,pos=>{const e=window.__ttvEngine;return !e.pendingTeleport&&Math.hypot(e.player.position.x-pos[0],e.player.position.z-pos[2])<.25},pos);await p.evaluate(()=>document.activeElement?.blur())}
export async function click3d(p,label){await p.evaluate(label=>{const e=window.__ttvEngine,i=[...e.interactables.values()].find(i=>i.spec().label===label);if(!i||i.spec().enabled===false)throw Error('Missing active interaction '+label);i.spec().onClick({peerId:e.runtime.self().peerId,hand:'none',point:[0,0,0]})},label)}
export const portals=[[-17,.12,-3],[17,3.42,2.5],[-17,.12,-12.2],[0,4.6,-19],[18,5.78,-21]]
export async function advance(p){const s=await state(p),stage=s.mission.stage;assert.equal(s.mission.cleared,true);await tp(p,portals[stage],0,stage!==4);await p.getByTestId('mission-next').click();await wait(p,stage=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.stage===stage+1,stage);await wait(p,()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game');return !window.__ttvEngine.pendingTeleport&&r.clock().now()>s.mission.openedAt+200});return state(p)}
export async function solve(p,{nativeJump=false,onStage}={}){
 const s=await state(p),stage=s.mission.stage;await wait(p,()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game');return r.clock().now()>Math.max(s.startedAt,s.mission.openedAt)+100})
 if(stage===0){
  await tp(p,[-13,.12,2.7]);
  for(let targetProgress=1;targetProgress<=5;targetProgress++){
   await wait(p,()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game'),m=s.mission,period=s.difficulty==='easy'?3600:s.difficulty==='normal'?3000:2400,at=r.clock().now()-m.openedAt;return Math.floor(at/period)!==m.lastBeat&&at%period>500&&at%period<1100});
   const n=await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game'),period=s.difficulty==='easy'?3600:s.difficulty==='normal'?3000:2400;return (Math.floor((r.clock().now()-s.mission.openedAt)/period)*5+(s.seed>>>3))%3});
   await p.keyboard.press(`Digit${n+1}`);await wait(p,n=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress>=n,targetProgress)
  }
 }
 if(stage===1){
  if(nativeJump&&await p.getByRole('button',{name:'◉ 快適移動',exact:true}).count())await p.getByRole('button',{name:'◉ 快適移動',exact:true}).click()
  if(!nativeJump&&await p.getByRole('button',{name:'○ 自由移動',exact:true}).count())await p.getByRole('button',{name:'○ 自由移動',exact:true}).click()
  await tp(p,[16,.12,6.4]);await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress>=1)
  if(nativeJump){await tp(p,[16,.12,5.6]);await click3d(p,'踏切から跳躍');await p.keyboard.down('KeyW');try{await wait(p,()=>window.__ttvEngine.player.position.y>3.6);await wait(p,()=>window.__ttvEngine.player.position.z<3.8)}finally{await p.keyboard.up('KeyW')}await wait(p,()=>window.__ttvEngine.player.grounded&&window.__ttvEngine.player.position.y>3.3)}
  else {await p.evaluate(()=>window.__ttvEngine.runtime.teleport([16,.12,5.6],0));await wait(p,()=>window.__ttvEngine.player.position.y>3.3);await tp(p,[16,3.5,3])}
  await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress>=2)
  await tp(p,[12,.12,7]);await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress===3)
  await tp(p,[17,3.5,2.5]);await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.cleared)
 }
 if(stage===2){for(let i=0;i<4;i++){if((await state(p)).mission.deliveries.includes(i))continue;await tp(p,[[-16,-2.8,-16],[-12,-2.8,-18],[-16,-2.8,-20],[-12,-2.8,-20.5]][i]);await wait(p,i=>{const r=window.__ttvEngine.runtime;return r.state.get('w:oboro:game').mission.carried[r.self().peerId]===i},i);await tp(p,[-14,.12,-12.3]);await wait(p,i=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.deliveries.includes(i),i)}}
 if(stage===3){for(const [i,pos]of [[0,[-2,1,-17]],[1,[2,2.8,-20]],[2,[-2,4.6,-21]]]){await tp(p,pos);await wait(p,i=>{const s=window.__ttvEngine.runtime.state.get('w:oboro:game');return s.mission.charges[i]>=(s.difficulty==='easy'?2:s.difficulty==='normal'?3:4)},i)}}
 if(stage===4){
  await tp(p,[12.5,.12,-16]);await click3d(p,(await p.getByRole('button',{name:'◉ 快適移動',exact:true}).count())?'壁の足場へ':'壁を歩く');await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress>=1)
  // Stock pads retain their real 900 ms arrival cooldown; do not click during it.
  await p.waitForTimeout(1000);await click3d(p,'天井へ渡る');await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.progress>=2)
  await tp(p,[18,await p.evaluate(()=>window.__ttvEngine.runtime.locomotion?5.78:4.3),-21],0,false);await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.cleared)
 }
 await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').mission.cleared)
 assert.equal((await state(p)).keys.length,stage+1);if(onStage)await onStage(stage)
}
