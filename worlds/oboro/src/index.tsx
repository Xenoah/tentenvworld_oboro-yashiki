// Based on TenTenV's official worlds/template/src/index.tsx (AGPL-3.0-only).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Clickable, FaceCamera, SpawnPad, SpatialSound, TextPlane, useDevice, useIsHost, usePlayers, useRuntime, useSyncedState, useWorldStore } from '@tentenv/sdk'
import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MovementEffects, type MovementVisual } from './MovementEffects'
import { Pad, Rope, Touch, markWarp } from './Pads'
import { Taiko, play, setCuesEnabled, type Mood } from './audio'
import { SoftLighting, DEFAULT_VISUALS, type VisualSettings } from './Lighting'
import { Architecture, useMaterials, type Materials } from './Architecture'
import { ACTIONS, DIFFICULTIES, KEYS, SPAWN, command, distance, elapsed, initialState, remaining, tick, type Command, type GameState, type V3 } from './game'
import { Hud, clock } from './Hud'
import { Ninja, Smoke } from './Ninja'

const STATE = 'w:oboro:game'
function useGame(){
  const rt=useRuntime(),host=useIsHost(),players=usePlayers()
  const [state]=useSyncedState<GameState>('oboro:game',initialState())
  const [message,setMessage]=useState('五つの印を集め、夜明けまでに門を開け。')
  const accumulator=useRef(0),store=useWorldStore(),[best,setBest]=useState({score:0,time:0})
  useEffect(()=>{void Promise.all([store.player.get('oboro-best'),store.player.get('oboro-best-time')]).then(([a,b])=>setBest({score:Number(a)||0,time:Number(b)||0})).catch(()=>{})},[store])
  useEffect(()=>{rt.teleport(SPAWN,0)},[rt])
  const send=(kind:string,value?:string)=>rt.events.emit('oboro:command',{run:state.run,kind,value},'host')
  useEffect(()=>{
    if(host&&!rt.state.has(STATE))rt.state.set(STATE,initialState())
    return rt.events.on('oboro:command',(payload,from)=>{
      if(rt.hostId()!==rt.self().peerId || !rt.players().some(p=>p.peerId===from.peerId))return
      const s=(rt.state.get(STATE)??initialState()) as GameState
      const cmd=payload as Command,pose=rt.pose(from.peerId);if(!pose)return
      const next=command(s,cmd,{id:from.peerId,pos:pose.position,grounded:pose.grounded},rt.clock().now(),from.peerId===rt.hostId())
      if(next!==s){rt.state.set(STATE,next);if(cmd.kind==='recover')rt.events.emit('oboro:rescue',{run:s.run},from.peerId)}
    })
  },[rt,host])
  useEffect(()=>rt.events.on('oboro:rescue',(p,from)=>{if(from.peerId===rt.hostId()&&(p as {run:number}).run===state.run){rt.locomotion?.set(null);rt.teleport(SPAWN,0);setMessage('玄関へ帰還。9秒の保護時間 / -150点')}}),[rt,state.run])
  useFrame((_,dt)=>{
    if(!host)return
    accumulator.current+=dt;if(accumulator.current<.2)return;accumulator.current=0
    const s=(rt.state.get(STATE)??initialState()) as GameState
    const list=rt.players().map(p=>{const pose=rt.pose(p.peerId);return {id:p.peerId,pos:pose?.position??SPAWN,grounded:pose?.grounded,speed:pose?.speed}})
    const next=tick(s,list,rt.clock().now());if(next!==s)rt.state.set(STATE,next)
  })
  const last=useRef({run:state.run,phase:state.phase,count:state.keys.length,stars:state.stars.length})
  useEffect(()=>{
    if(last.current.run!==state.run||last.current.phase!==state.phase){
      rt.locomotion?.set(null);rt.teleport(SPAWN,0)
      setMessage(state.phase==='running'?'印・星・光る輪には触れるだけ。橙の輪は縁側の縄。忍者は中庭を巡回する。':state.reason||'準備ができたら探索を始めよう。')
      if(state.phase==='won'){const time=Math.round(elapsed(state,state.endedAt));const next={score:Math.max(best.score,state.score),time:best.time?Math.min(best.time,time):time};setBest(next);void store.player.set('oboro-best',next.score).then(()=>store.player.set('oboro-best-time',next.time)).catch(()=>{})}
    }
    if(last.current.run===state.run&&last.current.count<state.keys.length){setMessage(`${KEYS.find(k=>k.id===state.keys.at(-1))?.name}を共有しました。${state.keys.length}/5`);play(rt.audioListener(),'seal')}
    if(last.current.run===state.run&&last.current.stars<state.stars.length)play(rt.audioListener(),'star')
    last.current={run:state.run,phase:state.phase,count:state.keys.length,stars:state.stars.length}
  },[state.run,state.phase,state.keys.length,state.stars.length])
  // Spotted / smoke cues follow shared state, so every peer hears its own alert.
  const me=rt.self().peerId,spotted=state.phase==='running'&&state.enemies.some(e=>e.target===me&&(e.mode==='chase'||e.mode==='warning')),wasSpotted=useRef(false),clouds=useRef(0)
  useEffect(()=>{if(spotted&&!wasSpotted.current){play(rt.audioListener(),'alert');setMessage('見つかった！ 屏風や庭石の陰へ。煙玉 [B] で目くらまし')}wasSpotted.current=spotted},[spotted])
  useEffect(()=>{const n=state.clouds?.length??0;if(n>clouds.current)play(rt.audioListener(),'smoke');clouds.current=n},[state.clouds?.length])
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(e.code==='KeyB'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test(t?.tagName??'')&&!t?.isContentEditable)rt.events.emit('oboro:command',{run:stateRef.current.run,kind:'smoke:use'},'host')};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[rt])
  const stateRef=useRef(state);stateRef.current=state
  return {state,send,host,players,message,setMessage,best,held:state.held?.[me]??0}
}
type Game=ReturnType<typeof useGame>

export default function World(){return <><RigidBody type="fixed" colliders={false}><CuboidCollider args={[9,.1,3]} position={[0,-.1,12.5]}/></RigidBody><Suspense fallback={null}><Oboro/></Suspense></>}
function Oboro(){
  const m=useMaterials(),game=useGame(),device=useDevice(),rt=useRuntime(),motion=useRef<MovementVisual>({intensity:0,mode:'idle',dust:0})
  const [comfort,setComfort]=useState(true),[sound,saveSound]=useState(false),[help,setHelp]=useState(false),[visuals,setVisuals]=useState<VisualSettings>(DEFAULT_VISUALS)
  const setSound=(value:boolean)=>{saveSound(value);if(value)void rt.audioListener().context.resume().catch(()=>{})}
  return <>
    <color attach="background" args={['#101e29']}/><fog attach="fog" args={['#172b32',28,85]}/>
    <hemisphereLight args={['#c0d5e4','#5b4230',1.0]}/><SoftLighting settings={visuals} motion={motion}/><MovementEffects state={game.state} sound={sound} visual={motion}/>
    <directionalLight position={[-12,22,10]} color="#c7daec" intensity={1.7} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-27} shadow-camera-right={27} shadow-camera-top={30} shadow-camera-bottom={-28} shadow-camera-far={70} shadow-bias={-.0004} shadow-normalBias={.025} shadow-radius={3}/>
    <pointLight position={[0,5,-20]} color="#889bff" intensity={16} distance={10} decay={2}/>
    <pointLight position={[-14,-.5,-18]} color="#4faeaa" intensity={12} distance={9} decay={2}/>
    <SpawnPad position={SPAWN} yaw={0}/>
    <Architecture materials={m} shading={visuals.shading}/>
    <Moon/><Water/><Dust/><ComfortCurtain enabled={comfort}/>
    <Board game={game} comfort={comfort} setComfort={setComfort} sound={sound} setSound={setSound} materials={m}/>
    <Gimmicks game={game} m={m} comfort={comfort}/>
    <Mobility game={game} comfort={comfort} m={m}/>
    {game.state.enemies.map((e,i)=><Ninja key={i} enemy={e} m={m} active={game.state.phase==='running'} difficulty={game.state.difficulty}/>) }
    <Smoke state={game.state} m={m} send={game.send} now={()=>rt.clock().now()}/>
    <Music game={game} sound={sound}/>
    {sound&&<SpatialSound src="garden.wav" position={[0,1,0]} volume={.45} maxDistance={65} refDistance={15} loop/>}
    {device!=='vr'&&<Hud game={game} comfort={comfort} setComfort={setComfort} sound={sound} setSound={setSound} help={help} setHelp={setHelp} visuals={visuals} setVisuals={setVisuals} extra={game.held>0&&game.state.phase==='running'?<button data-testid="smoke" onClick={()=>game.send('smoke:use')} style={{border:'1px solid #cfd6d8',borderRadius:3,background:'#3b4548',color:'#f1f4f5',padding:'7px 10px',cursor:'pointer',fontFamily:'inherit',fontSize:11}}>煙玉 ×{game.held} [B]</button>:undefined}/>}
  </>
}
function Button3D({text,position,onClick,material,width=1.1,rotation}:{text:string;position:V3;onClick:()=>void;material:T.Material;width?:number;rotation?:V3}){
  return <Clickable label={text.replace(/\n/g,' ')} reach={3.3} position={position} rotation={rotation} onClick={onClick}>
    <mesh material={material} castShadow><boxGeometry args={[width,.38,.14]}/></mesh>
    <TextPlane text={text} width={width-.08} lineHeight={.11} position={[0,0,.076]} color="#fff0ca" padding={.01}/>
  </Clickable>
}
function Board({game:g,comfort,setComfort,sound,setSound,materials:m}:{game:Game;comfort:boolean;setComfort:(v:boolean)=>void;sound:boolean;setSound:(v:boolean)=>void;materials:Materials}){
  const s=g.state,left=Math.ceil(remaining(s,s.updatedAt))
  return <group position={[-4.6,0,10.5]} rotation={[0,.35,0]} scale={.8}>
    <mesh position={[0,1.8,0]} material={m.darkwood} castShadow><boxGeometry args={[5.3,3.25,.2]}/></mesh>
    <TextPlane text="朧 の 屋 敷" width={4.3} lineHeight={.42} bold position={[0,2.65,.12]} color="#e8c996"/>
    <TextPlane text={`OBORO  /  THE HOUSE OF FIVE SEALS\n${s.phase==='running'?`探索中　${s.keys.length}/5 印　　残り ${clock(left)}`:s.phase==='won'?`脱出成功　${s.score} 点`:s.phase==='lost'?'探索失敗 — もう一度、夜の屋敷へ':'一〜四人協力脱出 / 操作は照準＋クリック・トリガー'}`} width={4.6} lineHeight={.14} position={[0,2.04,.13]} color="#d4d1bc"/>
    <Button3D text={s.phase==='lobby'?'探索を始める':s.phase==='running'?'玄関へ帰還':'再挑戦'} position={[0,1.2,.2]} width={1.5} material={m.red} onClick={()=>g.send(s.phase==='lobby'?'start':s.phase==='running'?'recover':'restart')}/>
    <Button3D text={`難易度：${DIFFICULTIES[s.difficulty].label}`} position={[-1.65,1.2,.2]} width={1.6} material={m.ink} onClick={()=>{const keys=['easy','normal','hard'];g.send('difficulty',keys[(keys.indexOf(s.difficulty)+1)%3])}}/>
    <Button3D text={comfort?'快適移動：入':'快適移動：切'} position={[1.65,1.2,.2]} width={1.6} material={m.ink} onClick={()=>setComfort(!comfort)}/>
    <Button3D text={sound?'環境音：入':'環境音：切'} position={[0,.65,.2]} width={1.5} material={m.ink} onClick={()=>setSound(!sound)}/>
    <TextPlane text="主催者が開始・難易度を選択。鍵と仕掛けは全員で共有。\n忍者が構えたら遮蔽物か安全な縁側へ。帰還には減点。" width={4.7} lineHeight={.115} position={[0,.22,.15]} color="#c4baa5"/>
  </group>
}
function Gimmicks({game:g,m,comfort}:{game:Game;m:Materials;comfort:boolean}){
  const rt=useRuntime(),s=g.state,running=s.phase==='running'
  const keyActive=(id:string)=>running&&!s.keys.includes(id)&&(id!=='wood'||s.door)&&(id!=='water'||s.valves.length===2)&&(id!=='void'||s.stars.length===3)
  const warp=(p:V3,look=0)=>{if(!running)return;markWarp();rt.locomotion?.set(null);rt.teleport(p,look);play(rt.audioListener(),'warp')}
  // Comfort mode and the standard client use warp pads; the extended client without comfort uses real swimming/floating.
  const pads=comfort||!rt.locomotion
  return <>
    <TextPlane text="一　廻り書院\n月に聞き、波を渡り、松に隠れよ" width={3.4} lineHeight={.23} position={[-14,2.8,2]} color="#e4ce9e"/>
    {['moon','wave','pine'].map((r,i)=><Button3D key={r} text={['月','波','松'][i]} position={ACTIONS[`rune:${r}`]} material={s.rune>i?m.brass:m.red} width={.7} onClick={()=>g.send(`rune:${r}`)}/>)}
    <RotatingDoor open={s.door} m={m}/>
    <TextPlane text={s.door?'奥の箱に、木の印。':'月 → 波 → 松'} width={1.2} lineHeight={.18} position={[-17,2,-5.55]} color="#392f22"/>
    {KEYS.map((k)=><group key={k.id} position={k.pos}>
      <mesh material={m.darkwood} position={[0,-.45,0]} castShadow><boxGeometry args={[.8,.6,.6]}/></mesh>
      <mesh material={m.brass} position={[0,-.13,0]}><boxGeometry args={[.86,.07,.66]}/></mesh>
      <Clickable label={`${k.name}を取る（仲間全員で共有）`} enabled={keyActive(k.id)} reach={2.3} onClick={()=>g.send(`key:${k.id}`)}>
        <Seal color={s.keys.includes(k.id)?'#525747':k.color} collected={s.keys.includes(k.id)}/>
      </Clickable>
      {/* Touching the seal takes it: run through without stopping to aim. */}
      <Touch position={[0,-.2,0]} size={[2.2,2.6,2.2]} enabled={keyActive(k.id)} onEnter={()=>g.send(`key:${k.id}`)}/>
      {!s.keys.includes(k.id)&&<FaceCamera position={[0,.65,0]}><TextPlane text={k.name} width={.9} lineHeight={.14} color={k.color}/></FaceCamera>}
    </group>)}
    <TextPlane text="二　跳躍の庭\n踏切台を踏めば高台へ" width={3} lineHeight={.25} position={[15,2,-1]} color="#efc589"/>
    {/* The extended client keeps the real jump impulse when comfort is off. */}
    <Clickable label={pads?'高台へ跳躍（快適ワープ）':'踏切台から跳躍'} reach={2.8} position={[16,.16,5.5]} onClick={()=>{if(!running)return;if(pads)warp([16,3.5,3.8]);else rt.locomotion!.impulse([0,10,0])}}>
      <mesh material={m.red}><cylinderGeometry args={[.9,.9,.18,24]}/></mesh>
      <TextPlane text="跳" width={.9} lineHeight={.4} position={[0,.15,0]} rotation={[-Math.PI/2,0,0]} color="#ffe0a2"/>
    </Clickable>
    <Touch position={[16,.2,5.5]} size={[1.5,2,1.5]} enabled={running&&pads} onEnter={()=>warp([16,3.5,3.8])}/>
    <Pad position={[14.6,3.42,1.9]} label="庭へ戻る" onEnter={()=>warp([14,.1,7])} enabled={running}/>
    <TextPlane text="三　水牢\n両岸の水門に触れて開け、水底へ" width={3.4} lineHeight={.22} position={[-14,2,-12.5]} color="#9acfc6"/>
    {[0,1].map(i=><group key={i}>
      <Clickable position={ACTIONS[`valve:${i}`]} label={`水門 ${i+1} を開く`} reach={3} onClick={()=>g.send(`valve:${i}`)}>
        <mesh material={s.valves.includes(i)?m.brass:m.red} rotation={[0,0,s.valves.includes(i)?Math.PI/2:0]}><torusGeometry args={[.33,.055,8,20]}/></mesh>
        <mesh material={m.brass}><boxGeometry args={[.6,.05,.08]}/></mesh>
        <TextPlane text={s.valves.includes(i)?'開':'水門'} width={.7} lineHeight={.13} position={[0,.6,0]}/>
      </Clickable>
      <Touch position={[ACTIONS[`valve:${i}`][0],0,-12.2]} size={[1.6,2.2,1.6]} enabled={running&&!s.valves.includes(i)} onEnter={()=>g.send(`valve:${i}`)}/>
    </group>)}
    <Pad position={[-12.6,.06,-12.4]} label={s.valves.length===2?'水牢へ潜る':'水牢へ潜る（水門 '+s.valves.length+'/2）'} color="#6ddacb" onEnter={()=>warp(rt.locomotion&&!comfort?[-12,-1.8,-16]:[-12.6,-2.9,-16.6])} enabled={running}/>
    <Pad position={[-11.2,-3.06,-20.6]} label="岸へ浮上" color="#6ddacb" onEnter={()=>warp([-14.6,.15,-11.6])} enabled={running}/>
    <TextPlane text="四　星 蔵\n一 → 二 → 三。足場を渡り、星に触れる" width={4} lineHeight={.23} position={[0,3.2,-15]} color="#bfcaee"/>
    {[0,1,2].map(i=><group key={i} position={ACTIONS[`star:${i}`]}>
      <Clickable label={`星 ${i+1} を灯す`} reach={2.7} onClick={()=>g.send(`star:${i}`)}><mesh rotation={[0,0,Math.PI/4]}><octahedronGeometry args={[.28]}/><meshStandardMaterial color={s.stars.includes(i)?'#ffe5a0':'#65769f'} emissive={s.stars.includes(i)?'#cc8a43':'#283363'} emissiveIntensity={1}/></mesh></Clickable>
      <Touch position={[0,-1,0]} size={[2.3,2.8,2.3]} enabled={running&&s.stars.length===i} onEnter={()=>g.send(`star:${i}`)}/>
      <TextPlane text={['一','二','三'][i]} width={.6} lineHeight={.2} position={[0,.5,0]}/>
    </group>)}
    {pads&&<>
      <Pad position={[0,.06,-16.1]} label="浮遊足場 一" color="#b0baff" onEnter={()=>warp([-2,1,-17])} enabled={running}/>
      <Pad position={[-2.65,.93,-16.35]} radius={.35} label="足場 二へ" color="#b0baff" onEnter={()=>warp([2,2.8,-20])} enabled={running}/>
      <Pad position={[2.65,2.73,-19.35]} radius={.35} label="足場 三へ" color="#b0baff" onEnter={()=>warp([-2,4.6,-21])} enabled={running}/>
      <Pad position={[-2.65,4.53,-20.35]} radius={.35} label="空の印へ" color="#b0baff" onEnter={()=>warp([0,4.6,-19])} enabled={running}/>
    </>}
    <Pad position={[.7,pads?4.53:.06,pads?-18.35:-16.6]} radius={.35} label="星蔵から戻る" onEnter={()=>warp([0,.1,-13.2])} enabled={running&&(pads||s.keys.includes('void'))}/>
    <TextPlane text="五　天井回廊\n足袋の印で壁へ。次に天井へ。" width={4} lineHeight={.23} position={[15,3.2,-15]} color="#d9bb7c"/>
    <SurfaceButtons m={m} game={g} comfort={comfort}/>
    {/* Ziplines along both engawa: south entrance <-> north deck. */}
    {[-9.6,9.6].map(x=><group key={x}>
      <Rope from={[x,2.75,8.8]} to={[x,2.75,-12.2]}/>
      <Pad position={[x,.14,8.8]} label="縄で北の廊下へ" color="#e9a560" arrow={0} onEnter={()=>warp([x,.2,-10],0)} enabled={running}/>
      <Pad position={[x,.06,-12.2]} label="縄で玄関側へ" color="#e9a560" arrow={Math.PI} onEnter={()=>warp([x,.25,7.2],Math.PI)} enabled={running}/>
    </group>)}
    <Button3D text={s.keys.length===5?'五印を納め、脱出':'脱出門 / 五つの印が必要'} position={ACTIONS.exit} rotation={[0,Math.PI,0]} width={2.7} material={s.keys.length===5?m.brass:m.red} onClick={()=>g.send('exit')}/>
    <Touch position={[0,0,16.4]} size={[3,2.4,1.4]} enabled={running&&s.keys.length===5} onEnter={()=>g.send('exit')}/>
    <TextPlane text="忍者は中庭を巡回。玄関・縁側・試練の部屋は安全。" width={6} lineHeight={.14} position={[0,3.2,8]} color="#c8d4c8"/>
  </>
}
function SurfaceButtons({m,game:g,comfort}:{m:Materials;game:Game;comfort:boolean}){
  const rt=useRuntime(),running=g.state.phase==='running',pads=comfort||!rt.locomotion
  const enter=(mode:'wall'|'ceiling'|'floor')=>{
    if(!running)return
    const p:V3=mode==='wall'?[10,1.5,-18]:mode==='ceiling'?[14,rt.locomotion?5.78:4.3,-19]:[14,.1,-13.2]
    markWarp();rt.events.emit('oboro:surface-local',{mode},rt.self().peerId);rt.teleport(p,0);play(rt.audioListener(),'warp')
  }
  return <>
    <Pad position={[11.2,.06,-16]} label={pads?'壁の足場へ':'壁を歩く'} color="#f4d49b" onEnter={()=>enter('wall')} enabled={running}/>
    {pads?<>
      <Pad position={[10.6,1.43,-17.3]} radius={.35} label="天井へ渡る" color="#f4d49b" onEnter={()=>enter('ceiling')} enabled={running}/>
      <Pad position={[13.3,4.23,-18.3]} radius={.35} label="床に戻る" onEnter={()=>enter('floor')} enabled={running}/>
    </>:<>
      <Button3D text="天井へ渡る" position={[10.7,3.2,-18.5]} material={m.brass} onClick={()=>enter('ceiling')}/>
      <Button3D text="床に戻る" position={[15,4.8,-20.8]} material={m.ink} onClick={()=>enter('floor')}/>
      <Button3D text="壁から戻る" position={[10.7,1.5,-19.4]} material={m.ink} onClick={()=>enter('floor')}/>
    </>}
  </>
}
const FOOTRESTS:V3[]=[[-2,.85,-17],[2,2.65,-20],[-2,4.45,-21],[0,4.45,-19],[10,1.35,-18],[14,4.15,-19],[16,4.15,-20]]
function Mobility({game:g,comfort,m}:{game:Game;comfort:boolean;m:Materials}){
  const rt=useRuntime(),device=useDevice(),surface=useRef<'wall'|'ceiling'|'floor'>('floor'),lastRescue=useRef(0)
  useEffect(()=>rt.events.on('oboro:surface-local',(p,from)=>{if(from.peerId===rt.self().peerId)surface.current=(p as {mode:typeof surface.current}).mode}),[rt])
  useEffect(()=>{surface.current='floor';rt.locomotion?.set(null);return()=>rt.locomotion?.set(null)},[g.state.run,g.state.phase])
  useFrame(()=>{
    const p=rt.pose(rt.self().peerId)?.position;if(!p)return
    if(g.state.phase!=='running'){rt.locomotion?.set(null);return}
    if(p[1]<-8||Math.abs(p[0])>23||p[2]<-28||p[2]>22){if(rt.clock().now()-lastRescue.current>3000){lastRescue.current=rt.clock().now();g.send('recover')};return}
    if(surface.current!=='floor'&&(p[0]<9||p[0]>21||p[2]>-14||p[2]<-25))surface.current='floor'
    if(surface.current==='wall'){
      rt.locomotion?.set({mode:'surface',up:[1,0,0],speed:1.5,min:[9.8,.7,-23.5],max:[10,4.6,-16],rotateView:!comfort&&device!=='vr'})
    }else if(surface.current==='ceiling'){
      rt.locomotion?.set({mode:'surface',up:[0,-1,0],speed:1.5,min:[11,5.78,-23.5],max:[19,5.78,-16],rotateView:!comfort&&device!=='vr'})
    }else if(p[0]>-18&&p[0]<-10&&p[2]<-14&&p[2]>-22&&p[1]<.5){
      rt.locomotion?.set({mode:'swim',speed:1.8,min:[-17.6,-2.95,-21.6],max:[-10.4,.2,-14.4]})
    }else if(Math.abs(p[0])<4.2&&p[2]<-15.2&&p[2]>-24.6){
      rt.locomotion?.set({mode:'float',speed:2,min:[-4,.08,-24.4],max:[4,6,-15.1]})
    }else rt.locomotion?.set(null)
  },-4)
  // Compatibility footrests for stock clients; official rigidbody API only.
  if(rt.locomotion)return null
  // Visible lacquered planks: the standard client stands on these instead of swimming, floating or wall walking.
  return <><RigidBody type="fixed" colliders={false}>{FOOTRESTS.map((p,i)=><CuboidCollider key={i} args={[1,.08,1]} position={p}/>)}</RigidBody>
    {FOOTRESTS.map((p,i)=><group key={i} position={p}><mesh material={m.cedar} castShadow receiveShadow><boxGeometry args={[2,.16,2]}/></mesh><mesh material={m.brass} position={[0,-.1,0]}><boxGeometry args={[2.06,.04,2.06]}/></mesh></group>)}</>
}
function RotatingDoor({open,m}:{open:boolean;m:Materials}){
  const ref=useRef<T.Group>(null),body=useRef<import('@react-three/rapier').RapierRigidBody>(null),angle=useRef(0)
  useFrame((_,dt)=>{angle.current=T.MathUtils.damp(angle.current,open?Math.PI/2:0,4,dt);ref.current!.rotation.y=angle.current;body.current?.setNextKinematicRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle.current))})
  return <group position={[-15,0,-2]}>
    <RigidBody ref={body} type="kinematicPosition" colliders={false}><CuboidCollider args={[.1,1.5,2.8]} position={[0,1.5,0]}/></RigidBody>
    <group ref={ref}><mesh material={m.cedar} position={[0,1.5,0]} castShadow><boxGeometry args={[.18,3,5.6]}/></mesh>{[-2,-1,0,1,2].map(z=><mesh key={z} material={m.darkwood} position={[.12,1.5,z]}><boxGeometry args={[.04,3,.06]}/></mesh>)}</group>
    <mesh material={m.brass} position={[0,.15,0]}><cylinderGeometry args={[.2,.2,.3,16]}/></mesh>
  </group>
}
function Seal({color,collected}:{color:string;collected:boolean}){
  const ref=useRef<T.Group>(null)
  useFrame(({clock})=>{if(ref.current&&!collected){ref.current.rotation.y=clock.elapsedTime*.6;ref.current.position.y=Math.sin(clock.elapsedTime*2)*.06}})
  return <group ref={ref}><mesh castShadow><torusGeometry args={[.19,.045,8,24]}/><meshStandardMaterial color={color} metalness={.65} roughness={.3} emissive={color} emissiveIntensity={collected?0:.45}/></mesh><mesh position={[0,-.23,0]}><boxGeometry args={[.07,.3,.07]}/><meshStandardMaterial color={color} metalness={.7} roughness={.3}/></mesh><mesh position={[.06,-.34,0]}><boxGeometry args={[.17,.055,.07]}/><meshStandardMaterial color={color} metalness={.7}/></mesh></group>
}
function Water(){
  const ref=useRef<T.Mesh>(null)
  const ripples=useMemo(()=>{const rings=Array.from({length:8},(_,i)=>new T.RingGeometry(.45+i*.46,.465+i*.46,32));const merged=mergeGeometries(rings);rings.forEach(g=>g.dispose());return merged},[])
  useEffect(()=>()=>ripples.dispose(),[ripples])
  useFrame(({clock})=>{if(ref.current)ref.current.position.y=.08+Math.sin(clock.elapsedTime*.6)*.025})
  return <group><mesh ref={ref} position={[-14,.1,-18]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[8,8]}/><meshStandardMaterial color="#2c7372" transparent opacity={.48} roughness={.18} metalness={.25} side={T.DoubleSide}/></mesh><mesh geometry={ripples} position={[-14,.14,-18]} rotation={[-Math.PI/2,0,0]}><meshBasicMaterial color="#b5d7c1" transparent opacity={.10} depthWrite={false} side={T.DoubleSide}/></mesh></group>
}
function Moon(){return <group><mesh position={[-18,32,-48]}><sphereGeometry args={[2.5,24,16]}/><meshBasicMaterial color="#e9e5ce"/></mesh><mesh position={[-18,32,-48]}><sphereGeometry args={[3.3,24,16]}/><meshBasicMaterial color="#b8d5dc" transparent opacity={.06} depthWrite={false}/></mesh></group>}
function Dust(){const ref=useRef<T.Points>(null),positions=useMemo(()=>{const a=new Float32Array(180*3);for(let i=0;i<180;i++){a[i*3]=Math.sin(i*237.1)*20;a[i*3+1]=.4+(i%34)*.16;a[i*3+2]=Math.cos(i*87.2)*19-3}return a},[]);useFrame(({clock})=>{if(ref.current)ref.current.rotation.y=clock.elapsedTime*.003});return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions,3]}/></bufferGeometry><pointsMaterial size={.025} color="#edcf8c" transparent opacity={.45} depthWrite={false}/></points>}

/** Taiko loop: calm in the lobby, faster as dawn nears, a heartbeat while a ninja is on you. */
function Music({game:g,sound}:{game:Game;sound:boolean}){
  const rt=useRuntime(),mood=useRef<Mood>({tempo:84,danger:false})
  useFrame(()=>{const s=g.state,now=rt.clock().now(),left=s.phase==='running'?remaining(s,now):999,me=rt.self().peerId
    mood.current={tempo:s.phase!=='running'?78:left<=60?150:left<=120?118:100,danger:s.phase==='running'&&s.enemies.some(e=>e.target===me&&e.mode!=='patrol')}})
  useEffect(()=>{setCuesEnabled(sound);if(!sound)return;const l=rt.audioListener(),gain=l.context.createGain();gain.gain.value=.45;gain.connect(l.getInput());const t=new Taiko(l.context,gain,()=>mood.current);t.start();return()=>{t.stop();gain.disconnect()}},[sound,rt])
  return null
}
/** Fade within the 3D scene after large positional jumps; works in both eyes in XR. */
function ComfortCurtain({enabled}:{enabled:boolean}){
  const {camera}=useThree(),rt=useRuntime(),ref=useRef<T.Mesh>(null),last=useRef<V3|null>(null),fade=useRef(0)
  useFrame((_,dt)=>{
    const p=rt.pose(rt.self().peerId)?.position;if(!p||!ref.current)return
    if(enabled&&last.current&&distance(p,last.current)>2.4)fade.current=1
    last.current=[...p];fade.current=Math.max(0,fade.current-dt*3)
    const mesh=ref.current;mesh.visible=enabled&&fade.current>.01
    mesh.position.copy(camera.position);mesh.quaternion.copy(camera.quaternion);mesh.translateZ(-.16)
    ;(mesh.material as T.MeshBasicMaterial).opacity=fade.current
  })
  return <mesh ref={ref} renderOrder={10000} frustumCulled={false}><planeGeometry args={[4,4]}/><meshBasicMaterial color="#071013" transparent opacity={0} depthTest={false} depthWrite={false} side={T.DoubleSide}/></mesh>
}
