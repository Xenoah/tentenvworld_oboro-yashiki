// Based on TenTenV's official worlds/template/src/index.tsx (AGPL-3.0-only).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Clickable, SpawnPad, SpatialSound, TextPlane, useDevice, useIsHost, usePlayers, useRuntime, useSyncedState, useWorldStore } from '@tentenv/sdk'
import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MovementEffects, type MovementVisual } from './MovementEffects'
import { SoftLighting, DEFAULT_VISUALS, type VisualSettings } from './Lighting'
import { Architecture, useMaterials, type Materials } from './Architecture'
import { ACTIONS, DIFFICULTIES, KEYS, SPAWN, command, distance, initialState, tick, type Command, type GameState, type V3 } from './game'

const STATE = 'w:oboro:game'
function useGame(){
  const rt=useRuntime(),host=useIsHost(),players=usePlayers()
  const [state]=useSyncedState<GameState>('oboro:game',initialState())
  const [message,setMessage]=useState('五つの印を集め、夜明けまでに門を開け。')
  const accumulator=useRef(0),store=useWorldStore()
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
  const last=useRef({run:state.run,phase:state.phase,count:state.keys.length})
  useEffect(()=>{
    if(last.current.run!==state.run||last.current.phase!==state.phase){
      rt.locomotion?.set(null);rt.teleport(SPAWN,0)
      setMessage(state.phase==='running'?'探索開始。玄関と各試練の室内は安全。忍者は中庭を巡回する。':state.reason||'準備ができたら探索を始めよう。')
      if(state.phase==='won'){void store.player.get('oboro-best').then(v=>store.player.set('oboro-best',Math.max(Number(v)||0,state.score))).catch(()=>{})}
    }
    if(last.current.count<state.keys.length)setMessage(`${KEYS.find(k=>k.id===state.keys.at(-1))?.name}を共有しました。${state.keys.length}/5`)
    last.current={run:state.run,phase:state.phase,count:state.keys.length}
  },[state.run,state.phase,state.keys.length])
  return {state,send,host,players,message,setMessage}
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
    {game.state.enemies.map((e,i)=><Ninja key={i} enemy={e} m={m} active={game.state.phase==='running'}/>) }
    {sound&&<SpatialSound src="garden.wav" position={[0,1,0]} volume={.45} maxDistance={65} refDistance={15} loop/>}
    {device!=='vr'&&<Hud game={game} comfort={comfort} setComfort={setComfort} sound={sound} setSound={setSound} help={help} setHelp={setHelp} visuals={visuals} setVisuals={setVisuals}/>}
  </>
}
function Button3D({text,position,onClick,material,width=1.1,rotation}:{text:string;position:V3;onClick:()=>void;material:T.Material;width?:number;rotation?:V3}){
  return <Clickable label={text.replace(/\n/g,' ')} reach={3.3} position={position} rotation={rotation} onClick={onClick}>
    <mesh material={material} castShadow><boxGeometry args={[width,.38,.14]}/></mesh>
    <TextPlane text={text} width={width-.08} lineHeight={.11} position={[0,0,.076]} color="#fff0ca" padding={.01}/>
  </Clickable>
}
function Board({game:g,comfort,setComfort,sound,setSound,materials:m}:{game:Game;comfort:boolean;setComfort:(v:boolean)=>void;sound:boolean;setSound:(v:boolean)=>void;materials:Materials}){
  const s=g.state,remaining=Math.max(0,DIFFICULTIES[s.difficulty].limit-Math.floor((s.updatedAt-s.startedAt)/1000))
  return <group position={[-4.6,0,10.5]} rotation={[0,.35,0]} scale={.8}>
    <mesh position={[0,1.8,0]} material={m.darkwood} castShadow><boxGeometry args={[5.3,3.25,.2]}/></mesh>
    <TextPlane text="朧 の 屋 敷" width={4.3} lineHeight={.42} bold position={[0,2.65,.12]} color="#e8c996"/>
    <TextPlane text={`OBORO  /  THE HOUSE OF FIVE SEALS\n${s.phase==='running'?`探索中　${s.keys.length}/5 印　　残り ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:s.phase==='won'?`脱出成功　${s.score} 点`:s.phase==='lost'?'探索失敗 — もう一度、夜の屋敷へ':'一〜四人協力脱出 / 操作は照準＋クリック・トリガー'}`} width={4.6} lineHeight={.14} position={[0,2.04,.13]} color="#d4d1bc"/>
    <Button3D text={s.phase==='lobby'?'探索を始める':s.phase==='running'?'玄関へ帰還':'再挑戦'} position={[0,1.2,.2]} width={1.5} material={m.red} onClick={()=>g.send(s.phase==='lobby'?'start':s.phase==='running'?'recover':'restart')}/>
    <Button3D text={`難易度：${DIFFICULTIES[s.difficulty].label}`} position={[-1.65,1.2,.2]} width={1.6} material={m.ink} onClick={()=>{const keys=['easy','normal','hard'];g.send('difficulty',keys[(keys.indexOf(s.difficulty)+1)%3])}}/>
    <Button3D text={comfort?'快適移動：入':'快適移動：切'} position={[1.65,1.2,.2]} width={1.6} material={m.ink} onClick={()=>setComfort(!comfort)}/>
    <Button3D text={sound?'環境音：入':'環境音：切'} position={[0,.65,.2]} width={1.5} material={m.ink} onClick={()=>setSound(!sound)}/>
    <TextPlane text="主催者が開始・難易度を選択。鍵と仕掛けは全員で共有。\n忍者が構えたら遮蔽物か安全な縁側へ。帰還には減点。" width={4.7} lineHeight={.115} position={[0,.22,.15]} color="#c4baa5"/>
  </group>
}
function Gimmicks({game:g,m,comfort}:{game:Game;m:Materials;comfort:boolean}){
  const rt=useRuntime(),s=g.state
  const keyActive=(id:string)=>s.phase==='running'&&!s.keys.includes(id)&&(id!=='wood'||s.door)&&(id!=='water'||s.valves.length===2)&&(id!=='void'||s.stars.length===3)
  const warp=(p:V3,look=0)=>{rt.locomotion?.set(null);rt.teleport(p,look)}
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
      <TextPlane text={s.keys.includes(k.id)?'取得済':k.name} width={.9} lineHeight={.14} position={[0,.65,0]} color={k.color}/>
    </group>)}
    <TextPlane text="二　跳躍の庭\n踏切台で跳び、前進して高台へ" width={3} lineHeight={.25} position={[15,2,-1]} color="#efc589"/>
    <Clickable label={comfort?'高台へ跳躍（快適ワープ）':'踏切台から跳躍'} reach={2.8} position={[16,.16,5.5]} onClick={()=>{if(s.phase!=='running')return;if(comfort||!rt.locomotion)warp([16,3.5,3.8]);else rt.locomotion.impulse([0,10,0])}}>
      <mesh material={m.red}><cylinderGeometry args={[.9,.9,.18,24]}/></mesh>
      <TextPlane text="跳" width={.9} lineHeight={.4} position={[0,.15,0]} rotation={[-Math.PI/2,0,0]} color="#ffe0a2"/>
    </Clickable>
    <Button3D text="庭へ戻る" position={[17.5,4.1,3.5]} material={m.ink} onClick={()=>warp([14,.1,6])}/>
    <TextPlane text="三　水牢\n両岸の水門を開け、水底へ" width={3.4} lineHeight={.22} position={[-14,2,-12.5]} color="#9acfc6"/>
    {[0,1].map(i=><Clickable key={i} position={ACTIONS[`valve:${i}`]} label={`水門 ${i+1} を開く`} reach={3} onClick={()=>g.send(`valve:${i}`)}>
      <mesh material={s.valves.includes(i)?m.brass:m.red} rotation={[0,0,s.valves.includes(i)?Math.PI/2:0]}><torusGeometry args={[.33,.055,8,20]}/></mesh>
      <mesh material={m.brass}><boxGeometry args={[.6,.05,.08]}/></mesh>
      <TextPlane text={s.valves.includes(i)?'開':'水門'} width={.7} lineHeight={.13} position={[0,.6,0]}/>
    </Clickable>)}
    <Button3D text="水牢へ潜る" position={[-12,1,-12.6]} material={m.ink} onClick={()=>{if(s.phase==='running')warp(rt.locomotion?[-12,-1.8,-16]:[-12.6,-2.9,-16.6])}}/>
    {rt.locomotion&&<Button3D text="水底へ" position={[-12,-.8,-16]} material={m.ink} onClick={()=>warp([-14,-2.7,-17])}/>}
    <Button3D text="岸へ浮上" position={[-14,-1.8,-18.8]} material={m.ink} onClick={()=>warp([-12,.15,-12])}/>
    <TextPlane text="四　星 蔵\n一 → 二 → 三。空を歩き、印を結ぶ" width={4} lineHeight={.23} position={[0,3.2,-15]} color="#bfcaee"/>
    {[0,1,2].map(i=><group key={i} position={ACTIONS[`star:${i}`]}>
      <Clickable label={`星 ${i+1} を灯す`} reach={2.7} onClick={()=>g.send(`star:${i}`)}><mesh rotation={[0,0,Math.PI/4]}><octahedronGeometry args={[.28]}/><meshStandardMaterial color={s.stars.includes(i)?'#ffe5a0':'#65769f'} emissive={s.stars.includes(i)?'#cc8a43':'#283363'} emissiveIntensity={1}/></mesh></Clickable>
      <TextPlane text={['一','二','三'][i]} width={.6} lineHeight={.2} position={[0,.5,0]}/>
    </group>)}
    {(comfort||!rt.locomotion)&&<>
      <Button3D text="浮遊足場 一" position={[0,1,-15.4]} material={m.ink} onClick={()=>{if(s.phase==='running')warp([-2,1,-17])}}/>
      <Button3D text="浮遊足場 二" position={[-2,1.8,-17.5]} material={m.ink} onClick={()=>warp([2,2.8,-20])}/>
      <Button3D text="浮遊足場 三" position={[2,3.8,-20.5]} material={m.ink} onClick={()=>warp([-2,4.6,-21])}/>
      <Button3D text="空の印へ" position={[-2,5.5,-21.5]} material={m.ink} onClick={()=>warp([0,4.6,-19])}/>
    </>}
    <Button3D text="星蔵から戻る" position={[2.2,5.2,-20.4]} material={m.ink} onClick={()=>warp([0,.1,-13])}/>
    <TextPlane text="五　天井回廊\n足袋の印で壁へ。次に天井へ。" width={4} lineHeight={.23} position={[15,3.2,-15]} color="#d9bb7c"/>
    <SurfaceButtons m={m} game={g} comfort={comfort}/>
    <Button3D text={s.keys.length===5?'五印を納め、脱出':'脱出門 / 五つの印が必要'} position={ACTIONS.exit} rotation={[0,Math.PI,0]} width={2.7} material={s.keys.length===5?m.brass:m.red} onClick={()=>g.send('exit')}/>
    <TextPlane text="忍者は中庭を巡回。玄関・縁側・試練の部屋は安全。" width={6} lineHeight={.14} position={[0,3.2,8]} color="#c8d4c8"/>
  </>
}
function SurfaceButtons({m,game:g,comfort}:{m:Materials;game:Game;comfort:boolean}){
  const rt=useRuntime()
  const enter=(mode:'wall'|'ceiling'|'floor')=>{
    if(g.state.phase!=='running')return
    const p:V3=mode==='wall'?[10,1.5,-18]:mode==='ceiling'?[14,rt.locomotion?5.78:4.3,-19]:[14,.1,-13]
    rt.events.emit('oboro:surface-local',{mode},rt.self().peerId);rt.teleport(p,0)
  }
  return <>
    <Button3D text={comfort?'壁の足場へ':'壁を歩く'} position={[11,1.2,-15.7]} material={m.red} onClick={()=>enter('wall')}/>
    <Button3D text="天井へ渡る" position={[10.7,3.2,-18.5]} material={m.brass} onClick={()=>enter('ceiling')}/>
    <Button3D text="床に戻る" position={[15,4.8,-20.8]} material={m.ink} onClick={()=>enter('floor')}/>
    <Button3D text="壁から戻る" position={[10.7,1.5,-19.4]} material={m.ink} onClick={()=>enter('floor')}/>
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
function Ninja({enemy:e,m,active}:{enemy:GameState['enemies'][number];m:Materials;active:boolean}){
  const ref=useRef<T.Group>(null),leg1=useRef<T.Group>(null),leg2=useRef<T.Group>(null)
  useFrame(({clock},dt)=>{if(!ref.current)return;const dest=new T.Vector3(...e.pos),dir=dest.clone().sub(ref.current.position);ref.current.position.lerp(dest,1-Math.exp(-dt*12));if(dir.length()>.03)ref.current.rotation.y=Math.atan2(dir.x,dir.z);const w=Math.sin(clock.elapsedTime*(e.mode==='patrol'?4:7))*.3;leg1.current!.rotation.x=w;leg2.current!.rotation.x=-w})
  return <group ref={ref} position={e.pos} visible={active}>
    <mesh material={m.cloth} position={[0,1.12,0]} castShadow><capsuleGeometry args={[.23,.43,4,10]}/></mesh>
    <mesh material={m.cloth} position={[0,1.67,0]} castShadow><sphereGeometry args={[.22,12,10]}/></mesh>
    <mesh position={[0,1.71,.193]}><boxGeometry args={[.28,.065,.05]}/><meshStandardMaterial color="#a8997e" roughness={1}/></mesh>
    {[-.07,.07].map(x=><mesh key={x} position={[x,1.71,.225]}><sphereGeometry args={[.018,6,6]}/><meshBasicMaterial color="#171511"/></mesh>)}
    <mesh material={m.red} position={[0,.99,0]}><boxGeometry args={[.49,.12,.38]}/></mesh>
    {[-1,1].map((sign,i)=><group key={sign} ref={i===0?leg1:leg2} position={[sign*.14,.9,0]}><mesh position={[0,-.36,0]} material={m.cloth} castShadow><capsuleGeometry args={[.105,.5,4,8]}/></mesh><mesh position={[0,-.78,.07]} material={m.ink}><boxGeometry args={[.18,.12,.3]}/></mesh></group>)}
    {[-1,1].map(sign=><group key={sign} position={[sign*.28,1.3,0]} rotation={[e.mode==='warning'?-1.3:.15,0,sign*.22]}><mesh material={m.cloth} position={[0,-.25,0]} castShadow><capsuleGeometry args={[.09,.38,4,8]}/></mesh><mesh material={m.ink} position={[0,-.5,0]}><sphereGeometry args={[.095,8,8]}/></mesh></group>)}
    <mesh material={m.darkwood} position={[.15,1.3,-.22]} rotation={[0,0,-.5]}><cylinderGeometry args={[.035,.035,1.1,8]}/></mesh>
    {e.mode!=='patrol'&&<><TextPlane text={e.mode==='warning'?'危険！ 距離を取れ':e.mode==='investigate'?'足音を追っている':e.mode==='search'?'周囲を捜索中':'気配を察知'} width={1.8} lineHeight={.19} position={[0,2.2,0]} color="#ffab79"/><mesh rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[1.3,1.45,40]}/><meshBasicMaterial color="#ec9868" transparent opacity={.65} side={T.DoubleSide}/></mesh></>}
  </group>
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

function Hud({game:g,comfort,setComfort,sound,setSound,help,setHelp,visuals,setVisuals}: {game:Game;comfort:boolean;setComfort:(v:boolean)=>void;sound:boolean;setSound:(v:boolean)=>void;help:boolean;setHelp:(v:boolean)=>void;visuals:VisualSettings;setVisuals:(v:VisualSettings)=>void}){
  const rt=useRuntime(),s=g.state,secs=Math.max(0,DIFFICULTIES[s.difficulty].limit-Math.floor((s.updatedAt-s.startedAt)/1000)),atLobby=useRef(true)
  const [near,setNear]=useState(true),[visualOpen,setVisualOpen]=useState(false)
  useFrame(()=>{const p=rt.pose(rt.self().peerId)?.position;const n=!!p&&distance(p,ACTIONS.start)<6.4;if(n!==atLobby.current){atLobby.current=n;setNear(n)}})
  const panel:React.CSSProperties={background:'linear-gradient(135deg,rgba(13,29,31,.95),rgba(18,35,36,.88))',border:'1px solid #ad946052',boxShadow:'0 14px 45px #0005',backdropFilter:'blur(12px)'}
  const button:React.CSSProperties={border:'1px solid #9f89585c',borderRadius:3,background:'#233c3c',color:'#e6dcc5',padding:'9px 13px',cursor:'pointer',fontFamily:'inherit',fontSize:12}
  return <Html fullscreen calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div data-oboro-hud="true" style={{fontFamily:'"Noto Serif CJK JP","Yu Mincho",Georgia,serif',color:'#efe4cb',height:'100%',pointerEvents:'none'}}>
    <style>{`@media(max-width:680px){[data-oboro-hud] .oboro-heading{top:65px!important;left:12px!important;right:12px!important;gap:8px!important}.oboro-heading>div{padding:10px!important;min-width:0!important}.oboro-heading>div:first-child>div:nth-child(2){font-size:20px!important;letter-spacing:3px!important}.oboro-heading>div:first-child>div:first-child{font-size:8px!important;letter-spacing:1px!important}.oboro-heading>div:first-child>div:last-child{display:none}.oboro-heading [data-testid=timer]{font-size:24px!important}[data-oboro-hud] .oboro-seals{top:155px!important;left:12px!important;padding:10px 14px!important;max-width:165px!important}.oboro-seals>div{font-size:10px!important;gap:7px!important;margin:7px 0!important}.oboro-seals>div>span:last-child{display:none}.oboro-seals>div:last-child>span{display:inline!important}.oboro-toolbar{bottom:160px!important;left:10px!important;right:10px!important;justify-content:center!important}.oboro-toolbar>div:first-child{display:none}.oboro-toolbar button{padding:7px 8px!important;font-size:10px!important}[data-oboro-hud] [data-testid=message]{bottom:206px!important;width:90vw!important;max-width:90vw!important;font-size:10px!important;padding:9px!important}[data-oboro-hud] .oboro-help{right:12px!important;top:150px!important;width:calc(100vw - 24px)!important;max-height:45vh!important}}`}</style>
    <div className="oboro-heading" style={{position:'absolute',top:74,left:28,right:28,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16}}>
      <div style={{...panel,padding:'18px 24px',minWidth:210}}><div style={{fontSize:10,letterSpacing:5,color:'#bda976'}}>A COOPERATIVE ESCAPE</div><div style={{fontSize:30,letterSpacing:7,margin:'7px 0 4px'}}>朧の屋敷</div><div style={{fontSize:10,letterSpacing:4,color:'#9aada8'}}>OBORO · THE FIVE SEALS</div></div>
      <div style={{...panel,padding:'15px 20px',textAlign:'right'}}><div style={{fontSize:10,letterSpacing:3,color:'#a9bdb6'}}>夜明けまで</div><div data-testid="timer" style={{fontSize:31,fontVariantNumeric:'tabular-nums',margin:'4px 0'}}>{Math.floor(secs/60)}<span style={{color:'#b29c68'}}>:</span>{String(secs%60).padStart(2,'0')}</div><div style={{fontSize:11,color:'#bdc9c0'}}>{DIFFICULTIES[s.difficulty].label}　•　{Math.min(4,g.players.all.length)} / 4 人</div></div>
    </div>
    <div className="oboro-seals" style={{position:'absolute',top:230,left:28,...panel,padding:'16px 20px',maxWidth:225}}><div style={{fontSize:10,letterSpacing:3,color:'#bdab83',marginBottom:14}}>集めし印　{ s.keys.length } / 5</div>{KEYS.map((k,i)=><div key={k.id} style={{display:'flex',gap:14,alignItems:'center',margin:'11px 0',fontSize:13,color:s.keys.includes(k.id)?k.color:'#b0bbb1'}}><span style={{border:`1px solid ${s.keys.includes(k.id)?k.color:'#546663'}`,width:23,height:23,display:'grid',placeItems:'center',transform:'rotate(45deg)'}}><span style={{transform:'rotate(-45deg)',fontSize:11}}>{s.keys.includes(k.id)?'✓':i+1}</span></span>{k.name}<span style={{fontSize:9,marginLeft:'auto',color:'#7d9690'}}>{['書院','高台','水牢','星蔵','天井'][i]}</span></div>)}<div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #52635b66',fontSize:11,color:'#98aca1'}}>共同得点　<span data-testid="score">{s.score.toLocaleString()}</span></div></div>
    {(s.phase!=='running')&&<div style={{...panel,position:'absolute',left:'50%',top:'48%',transform:'translate(-50%,-50%)',width:440,maxWidth:'80vw',padding:'30px 36px',pointerEvents:'auto',textAlign:'center'}}>
      <div style={{fontSize:11,letterSpacing:5,color:'#bba57b'}}>{s.phase==='won'?'THE GATE IS OPEN':s.phase==='lost'?'LOST IN THE MIST':'月が沈む前に、五つの印を。'}</div>
      <h1 style={{fontSize:34,fontWeight:400,letterSpacing:4,margin:'16px 0'}}>{s.phase==='won'?'脱出成功':s.phase==='lost'?'探索失敗':'忍びの夜が、始まる'}</h1>
      <p style={{fontSize:13,lineHeight:1.9,color:'#afc0b5',margin:'12px 0 20px'}}>{s.phase==='lobby'?'木造の迷宮に眠る五つの印。仕掛けを解き、忍者の気配をかわして、仲間と朧の門へ。':s.reason}</p>
      {s.phase!=='lobby'&&<div style={{fontSize:25,color:'#e5c38a',marginBottom:18}}>{s.score.toLocaleString()} <span style={{fontSize:12}}>点 / 帰還 {s.recoveries} 回</span></div>}
      <div style={{display:'flex',gap:7,justifyContent:'center',marginBottom:18}}>{Object.entries(DIFFICULTIES).map(([key,c])=><button key={key} disabled={!g.host} onClick={()=>g.send('difficulty',key)} style={{...button,background:s.difficulty===key?'#8a6e43':'#233c3c'}}>{c.label}</button>)}</div>
      <button data-testid="start" disabled={!g.host||!near} onClick={()=>g.send(s.phase==='lobby'?'start':'restart')} style={{...button,width:'100%',background:'#ac8450',color:'#101d20',fontSize:15,padding:14,fontWeight:700}}>{g.host?(s.phase==='lobby'?'探索を始める':'もう一度挑む'):'主催者の開始を待っています'}</button>
      <p style={{fontSize:10,color:'#8da69c',margin:'14px 0 0'}}>1人でも、4人でも。鍵は全員で共有されます。</p>
    </div>}
    <div style={{position:'absolute',bottom:73,left:'50%',transform:'translateX(-50%)',...panel,padding:'11px 20px',fontSize:12,textAlign:'center',maxWidth:'70vw',whiteSpace:'normal',color:'#d4d6bc'}} data-testid="message">{g.message}</div>
    <div className="oboro-toolbar" style={{position:'absolute',bottom:20,left:28,right:28,display:'flex',gap:8,justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:11,color:'#bccabf',textShadow:'0 2px 8px #000'}}>{controlsText(!!rt.locomotion)}</div><div style={{display:'flex',gap:7,pointerEvents:'auto'}}><button style={button} onClick={()=>setComfort(!comfort)}>{comfort?'◉ 快適移動':'○ 自由移動'}</button><button style={button} onClick={()=>setSound(!sound)}>{sound?'音：入':'音：切'}</button><button style={button} onClick={()=>setHelp(!help)}>手引き</button><button data-testid="visual-settings" style={button} onClick={()=>setVisualOpen(!visualOpen)}>映像</button>{s.phase==='running'&&<button style={button} onClick={()=>g.send('recover')}>玄関へ帰還</button>}</div></div>
    {visualOpen&&<div className="oboro-help" data-testid="visual-panel" style={{...panel,position:'absolute',right:28,top:230,width:300,padding:22,pointerEvents:'auto',fontSize:12,lineHeight:1.9,zIndex:5}}><strong>柔らかな光</strong><div style={{display:'flex',gap:6,margin:'12px 0'}}>{([['auto','標準'],['low','軽量'],['off','切']] as const).map(([mode,label])=><button data-testid={`glow-${mode}`} key={mode} style={{...button,background:visuals.mode===mode?'#8a6e43':'#233c3c'}} onClick={()=>setVisuals({...visuals,mode})}>{label}</button>)}</div><label>光のにじみ　{Math.round(visuals.glow*100)}%<input data-testid="glow-strength" aria-label="光のにじみ" type="range" min="0" max=".55" step=".01" value={visuals.glow} onChange={e=>setVisuals({...visuals,glow:Number(e.target.value)})} style={{width:'100%'}}/></label><label style={{display:'block',marginTop:12}}>移動ブラー　{Math.round(visuals.blur*100)}%<input data-testid="motion-blur" aria-label="移動ブラー" type="range" min="0" max=".6" step=".01" value={visuals.blur} onChange={e=>setVisuals({...visuals,blur:Number(e.target.value)})} style={{width:'100%'}}/></label><label style={{display:'block',marginTop:12}}><input data-testid="baked-shading" type="checkbox" checked={visuals.shading} onChange={e=>setVisuals({...visuals,shading:e.target.checked})}/> 細部の陰影と灯り</label><p style={{color:'#adbcaf',marginBottom:0}}>軽量設定は灯りの周囲だけを柔らかくします。携帯端末・低解像度では自動で軽量表示。VRではにじみとブラーを無効にします。ブラーは0でOFF、携帯端末・低解像度でもOFFです。難易度には影響しません。</p></div>}
    {help&&<div className="oboro-help" style={{...panel,position:'absolute',right:28,top:230,width:360,maxHeight:'55vh',overflow:'auto',padding:24,pointerEvents:'auto',fontSize:12,lineHeight:1.9}}><strong style={{color:'#dfc18a'}}>探索の手引き</strong><p>画面をクリックして視点操作。Esc でカーソルを戻します。{rt.locomotion?'照準を合わせて E またはクリック。':'照準を合わせてクリック（標準クライアントではEキーは使えません）。'}VR はレイとトリガー。</p>{KEYS.map(k=><p key={k.id}>{k.hint}</p>)}<p>Shiftでダッシュ、Spaceで跳躍。下降中、足元が地面から75cm以内になったらXか「静音着地」を一度押す。早押し・押し忘れは足音となり、忍者が音の方向を捜索。VRは右B（実機未検証）。音のミュートでも忍者の聴覚は変わりません。</p><p>中庭の忍者は攻撃前に構えます。石や部屋に隠れ、距離を取ってください。捕まると全員敗北。帰還は -150 点。快適移動は難易度と無関係です。</p><p>{rt.locomotion?'泳ぎ・浮遊：向いた方向へ WASD、Space 上昇、Q 下降。':'標準クライアントでは泳ぎ・浮遊・壁歩きの代わりに木の足場とワープを使います。下降は左Ctrl。'}VR は上を向いて前進またはトリガー上昇。壁／天井は低速移動。快適モードは水平視点とワープ足場。</p><p style={{color:'#8ca69b'}}>コード・素材：AGPL-3.0-only / TenTenV contributors + Oboro contributors。保証なし。対応ソースと導入手順を配布物に同梱。</p></div>}
  </div></Html>
}

export const controlsText=(extended:boolean)=>extended?'WASD 移動　/　マウス 視点　/　E・クリック 調べる　/　Space 上昇　Q 下降':'WASD 移動　/　マウス 視点　/　クリック 調べる　/　Space 跳躍　Ctrl 下降'
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
