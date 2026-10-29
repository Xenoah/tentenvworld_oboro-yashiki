import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { FaceCamera, TextPlane, useDevice, useRuntime } from '@tentenv/sdk'
import * as T from 'three'
import { COMBAT, freshVital } from './combat'
import type { GameState } from './game'
import { play } from './audio'
import type { Materials } from './Architecture'

/** Presentation consumes host state; it never writes health, damage, targets or stamina. */
export function Combat({ state:s, sound, materials:m }: { state:GameState; sound:boolean; materials:Materials }) {
  const rt=useRuntime(), device=useDevice(), {camera,gl}=useThree(), id=rt.self().peerId
  const live=useRef(s);live.current=s
  const v=s.vitals?.[id]??freshVital(), running=s.phase==='running', jailed=!!s.jailed?.[id]
  const seq=useRef(0), hand=useRef(false), blade=useRef<T.Group>(null), visor=useRef<T.Group>(null), pulse=useRef<HTMLDivElement>(null)
  const [feedback,setFeedback]=useState('木刀は忍者をひるませる。倒しても加点なし。'),[effect,setEffect]=useState(.24)
  const attack=()=>{
    const current=live.current, vital=current.vitals?.[id]??freshVital(), now=rt.clock().now()
    if(current.phase!=='running'||current.jailed?.[id]||now<current.startedAt)return
    if(vital.stamina<COMBAT.cost){setFeedback('スタミナ不足。歩いて回復しよう');return}
    if(now-vital.attackAt<COMBAT.cooldown)return
    seq.current=Math.max(seq.current,vital.attackSeq)+1
    rt.events.emit('oboro:command',{run:current.run,kind:'attack',seq:seq.current},'host')
  }
  const attackRef=useRef(attack);attackRef.current=attack
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(e.code==='KeyJ'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test(t?.tagName??'')&&!t?.isContentEditable){e.preventDefault();attackRef.current()}}
    window.addEventListener('keydown',key)
    // Renew independently of render FPS, with a short expiry if the world unmounts/crashes.
    const renew=()=>{const a=live.current,b=a.vitals?.[id];rt.locomotion?.setSprintAllowed?.(a.phase==='running'?!b?.exhausted:null)}
    renew();const timer=window.setInterval(renew,100)
    return()=>{window.removeEventListener('keydown',key);window.clearInterval(timer);rt.locomotion?.setSprintAllowed?.(null)}
  },[rt,id])
  useEffect(()=>{seq.current=0;hand.current=false;setFeedback('J / 木刀：近くの忍者を正面に捉える');if(pulse.current){pulse.current.getAnimations().forEach(a=>a.cancel());pulse.current.style.opacity='0'}},[s.run,s.phase])
  useEffect(()=>{if(effect===0)pulse.current?.getAnimations().forEach(a=>a.cancel())},[effect])
  const prev=useRef({run:s.run,hurt:v.hurtAt,attack:v.attackAt,hp:v.hp})
  useEffect(()=>{
    const before=prev.current, now=rt.clock().now()
    // A busy renderer can commit HP several seconds after receipt. Present a new
    // HP loss when it reaches the UI; initial snapshots/rescues do not count as hits.
    if(before.run===s.run&&running&&v.hurtAt>before.hurt&&v.hp<before.hp){if(!gl.xr.isPresenting&&effect>0){pulse.current?.getAnimations().forEach(a=>a.cancel());pulse.current?.animate([{opacity:effect},{opacity:0}],{duration:1200,easing:'ease-out'})}setFeedback(v.hp>0?`被弾 −${s.difficulty==='easy'?35:50} HP。距離を取ろう`:'HP 0 — 捕縛');if(sound)play(rt.audioListener(),'hurt')}
    if(before.run===s.run&&v.attackAt>before.attack&&now-v.attackAt<1500){const strike=s.strikes?.find(e=>e.by===id&&e.at===v.attackAt);setFeedback(strike?.hit!=null?'命中！ 続けてひるませ、退路を作ろう':'空振り。正面2.4m以内を狙おう');if(sound)play(rt.audioListener(),strike?.hit!=null?'hit':'swing')}
    if(before.run===s.run&&before.hp===0&&v.hp>0)setFeedback('救出！ HP・気力が回復した')
    prev.current={run:s.run,hurt:v.hurtAt,attack:v.attackAt,hp:v.hp}
  },[v.hurtAt,v.attackAt,s.run,s.strikes,s.difficulty,v.hp,running,rt,id,sound,effect,gl])
  useFrame(()=>{
    const now=rt.clock().now(), a=live.current,b=a.vitals?.[id], active=a.phase==='running'&&now>=a.startedAt&&!a.jailed?.[id]
    const damage=active&&b?Math.max(0,1-(now-b.hurtAt)/700)*effect:0
    if(gl.xr.isPresenting)pulse.current?.getAnimations().forEach(a=>a.cancel())
    if(visor.current){visor.current.position.set(0,-.35,-1).applyQuaternion(camera.quaternion).add(camera.position);visor.current.quaternion.copy(camera.quaternion)}
    const g=blade.current
    if(g){g.visible=active&&!gl.xr.isPresenting;const t=b?Math.max(0,Math.min(1,(now-b.attackAt)/380)):1,swing=t<1?Math.sin(t*Math.PI):0;g.position.set(.34-swing*.52,-.38, -.72).applyQuaternion(camera.quaternion).add(camera.position);g.quaternion.copy(camera.quaternion);g.rotateZ(-.35+swing*1.8);g.rotateX(-.35+swing*.65)}
    const source=Array.from(gl.xr.getSession()?.inputSources??[]).find(x=>x.handedness==='right'),buttons=source?.gamepad?.buttons
    const pressed=!!(buttons?.[0]?.pressed&&buttons?.[1]?.pressed)
    if(pressed&&!hand.current)attackRef.current();hand.current=pressed
    document.documentElement.dataset.oboroHp=String(b?.hp??100)
    document.documentElement.dataset.oboroStamina=String(b?.stamina??100)
    document.documentElement.dataset.oboroDamage=String(damage)
  })
  return <>
    <group ref={blade} visible={false}>
      <mesh position={[0,.25,0]} material={m.cedar}><boxGeometry args={[.035,.72,.055]}/></mesh>
      <mesh position={[0,-.15,0]} material={m.darkwood}><cylinderGeometry args={[.028,.033,.18,8]}/></mesh>
      <mesh position={[0,-.05,0]}><boxGeometry args={[.12,.028,.08]}/><meshStandardMaterial color="#66523a" roughness={.6}/></mesh>
    </group>
    {(s.strikes??[]).map(e=><Impact key={`${s.run}:${e.id}`} event={e} now={()=>rt.clock().now()}/>)}
    {running&&s.enemies.map((e,i)=>(e.guard??100)<100&&<FaceCamera key={i} position={[e.pos[0],2.55,e.pos[2]]}><TextPlane text={e.guard===0?'体勢を崩した — 今が逃げ時':`体勢 ${e.guard}/100`} width={1.6} lineHeight={.15} color="#ffe0a0"/></FaceCamera>)}
    {device==='vr'&&running&&<group ref={visor}><TextPlane text={`HP ${v.hp} / 気力 ${Math.round(v.stamina)}\n右グリップ＋トリガー：木刀`} width={.8} lineHeight={.07} color="#eedbb9"/></group>}
    {device!=='vr'&&<Html fullscreen onOcclude={()=>{ /* Screen-space HUD is independent of the world origin. */ }} calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}>
      <div ref={pulse} data-testid="damage-pulse" style={{position:'absolute',inset:0,pointerEvents:'none',opacity:0,background:'radial-gradient(ellipse,transparent 45%,#c33b25 100%)'}}/>
      <style>{`body:has(.oboro-help) .oboro-combat{display:none}@media(max-width:680px){.oboro-combat{left:12px!important;top:182px!important;bottom:auto!important;width:160px!important;padding:8px!important;font-size:10px!important}}@media(max-width:680px) and (max-height:740px){.oboro-combat{top:170px!important;transform:scale(.82);transform-origin:top left}.oboro-movement{bottom:200px!important;width:160px!important}}`}</style>
      {running&&<div className="oboro-combat" data-testid="combat" style={{position:'absolute',left:24,bottom:80,width:224,padding:'12px 14px',border:'1px solid #a0885366',borderRadius:5,background:'linear-gradient(120deg,#14282ae8,#20332ed4)',color:'#eee0c1',fontFamily:'Georgia,"Yu Mincho",serif',fontSize:12,pointerEvents:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between'}}><b>体力 HP</b><span data-testid="hp">{v.hp} / 100</span></div>
        <meter aria-label="HP" min={0} max={100} value={v.hp} style={{width:'100%',height:10,accentColor:'#ce876d'}}/>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}><span>{v.exhausted?'息切れ — 歩いて回復':'気力 / STAMINA'}</span><span data-testid="stamina">{Math.round(v.stamina)}</span></div>
        <meter aria-label="スタミナ" min={0} max={100} value={v.stamina} style={{width:'100%',height:10,accentColor:'#b6c78a'}}/>
        <button data-testid="attack" disabled={jailed||v.stamina<COMBAT.cost} onClick={()=>attackRef.current()} style={{marginTop:8,width:'100%',padding:8,border:'1px solid #b79960',borderRadius:3,background:'#80623d',color:'#fff1d2',cursor:'pointer'}}>木刀 [J]　−22気力</button>
        <div data-testid="combat-feedback" style={{fontSize:10,lineHeight:1.6,minHeight:32,marginTop:6}}>{jailed?'救出されるとHP・気力が全回復':feedback}</div>
        <button data-testid="damage-effect" onClick={()=>setEffect(effect===.24?.12:effect===.12?0:.24)} style={{padding:0,border:0,background:'transparent',color:'#b8c4b4',cursor:'pointer',fontSize:10}}>被弾の縁色：{effect===0?'切':effect===.12?'弱':'標準'}</button>
        {!rt.locomotion?.setSprintAllowed&&<div style={{fontSize:9,color:'#e8c48e'}}>標準クライアント：ダッシュ制限非対応</div>}
      </div>}
    </Html>}
  </>
}
function Impact({event:e,now}:{event:GameState['strikes'][number];now:()=>number}){
 const ref=useRef<T.Group>(null),mat=useRef<T.MeshBasicMaterial>(null)
 useFrame(()=>{const t=(now()-e.at)/1000;if(ref.current){ref.current.visible=t>=0&&t<.55;ref.current.scale.setScalar(.6+Math.max(0,t)*2)}if(mat.current)mat.current.opacity=Math.max(0,1-t/.55)*.65})
 return <group ref={ref} position={[e.pos[0]-Math.sin(e.yaw)*1.2,e.pos[1]+1.1,e.pos[2]-Math.cos(e.yaw)*1.2]} rotation={[0,e.yaw,0]}><mesh><ringGeometry args={[.21,.25,20,1,0,Math.PI*1.4]}/><meshBasicMaterial ref={mat} color={e.hit===null?'#b3bfa9':'#ffd495'} transparent depthWrite={false} side={T.DoubleSide} toneMapped={false}/></mesh></group>
}
