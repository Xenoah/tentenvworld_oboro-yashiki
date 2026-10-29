import {useEffect,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import {CuboidCollider,RigidBody} from '@react-three/rapier'
import {Clickable,FaceCamera,TextPlane,useDevice,useRuntime} from '@tentenv/sdk'
import {DIFFICULTIES,distance,type GameState,type V3} from './game'
import {ANCHORS,chargeSeconds,checkpoint,gravityOpen,gravityPoint,inMissionRoom,JUMP_ROUTE,LANTERNS,REFLEX,reflexBeat,ROOMS,WATER_BANK} from './missions'
import {Pad,Touch,markWarp} from './Pads'
import type {Materials} from './Architecture'
import {play} from './audio'
import {clock} from './Hud'
const ENTRY_DOORS:{p:V3;s:V3}[]=[{p:[-9,1.7,3],s:[.2,3.4,3]},{p:[10,2.7,6],s:[.2,5.4,2.2]},{p:[-14,1.6,-11.5],s:[3.2,3.2,.2]},{p:[0,3.5,-15],s:[2.4,7,.2]},{p:[15,2.9,-15],s:[3,5.8,.2]}]
export function Missions({state:s,m,comfort,setComfort,sound,setSound,host,send}:{state:GameState;m:Materials;comfort:boolean;setComfort:(v:boolean)=>void;sound:boolean;setSound:(v:boolean)=>void;host:boolean;send:(kind:string,value?:string)=>void}){
 const rt=useRuntime(),device=useDevice(),live=useRef(s),lastBoundary=useRef(0),[now,setNow]=useState(()=>rt.clock().now());live.current=s
 const ms=s.mission!,stage=ms.stage,room=ROOMS[stage],running=s.phase==='running',ready=running&&now>=s.startedAt&&now>=ms.openedAt&&!ms.failed&&!ms.cleared&&!s.jailed[rt.self().peerId],pads=comfort||!rt.locomotion
 const action=(value:string)=>{const q=live.current;rt.events.emit('oboro:command',{run:q.run,kind:'mission',value,seq:q.mission?.attempt},'host')}
 const actionRef=useRef(action);actionRef.current=action
 const warp=(pos:V3,yaw=0)=>{markWarp();rt.events.emit('oboro:surface-local',{mode:'floor'},rt.self().peerId);rt.locomotion?.set(null);rt.teleport(pos,yaw);play(rt.audioListener(),'warp')}
 useEffect(()=>{const t=setInterval(()=>setNow(rt.clock().now()),100);return()=>clearInterval(t)},[rt])
 // New round, room, retry and late-join snapshot all use the same safe checkpoint.
 useEffect(()=>{warp(checkpoint(s));return()=>rt.locomotion?.set(null)},[s.run,s.phase,ms.attempt,rt])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{const q=live.current,t=e.target as HTMLElement|null;if(q.phase==='running'&&q.mission?.stage===0&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test(t?.tagName??'')&&!t?.isContentEditable&&/^Digit[123]$/.test(e.code)){e.preventDefault();actionRef.current(`hit:${Number(e.code.at(-1))-1}`)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
 useFrame(()=>{const q=live.current,p=rt.pose(rt.self().peerId)?.position;if(!p||q.phase!=='running'||!q.mission||q.mission.stage>=5||q.jailed[rt.self().peerId])return;if(!inMissionRoom(q.mission.stage,p)&&rt.clock().now()-lastBoundary.current>1800){lastBoundary.current=rt.clock().now();warp(checkpoint(q))}})
 const beat=reflexBeat(s,now),nearPortal=room&&distance(rt.pose(rt.self().peerId)?.position??checkpoint(s),room.portal)<3.3
 const visualPortal:V3=room?[room.portal[0],room.portal[1]+(stage===4?-1.2:1.1),room.portal[2]]:[0,1.2,17]
 const me=rt.self().peerId,held=ms.carried[me],total=[5,4,4,3,3][stage]
 return <>
  <RigidBody type="fixed" colliders={false}>{ENTRY_DOORS.map((b,i)=><CuboidCollider key={i} position={b.p} args={b.s.map(v=>v/2) as V3}/>)}</RigidBody>
  {ENTRY_DOORS.map((b,i)=><mesh key={i} position={b.p} material={m.paper} castShadow receiveShadow><boxGeometry args={b.s}/></mesh>)}
  {room&&<FaceCamera position={[room.spawn[0],room.spawn[1]+2.35,room.spawn[2]-3]}><TextPlane text={`${stage+1}　${room.name}\n${room.subtitle}`} width={3.1} lineHeight={.24} color="#ffe2a2"/></FaceCamera>}
  {(!running||ms.failed)&&<group position={checkpoint(s)}>{!running&&<><TextPlane text={s.phase==='won'?`脱出成功　${s.score}点`:'五つの部屋を越え、最後は庭へ'} position={[0,2.2,-1.8]} width={3.6} lineHeight={.2} color="#f5d6a2"/>{[['難易度：'+DIFFICULTIES[s.difficulty].label,()=>send('difficulty',(['easy','normal','hard'] as const)[(['easy','normal','hard'] as string[]).indexOf(s.difficulty)+1>2?0:(['easy','normal','hard'] as string[]).indexOf(s.difficulty)+1])],[comfort?'快適移動：入':'快適移動：切',()=>setComfort(!comfort)],[sound?'音：入':'音：切',()=>setSound(!sound)],['旧・探索へ',()=>send('mode','standard')]].map(([label,fn],i)=><Clickable key={i} label={String(label)} reach={4} position={[(i%2-.5)*1.8,.68-Math.floor(i/2)*.5,-1.8]} onClick={fn as ()=>void}><mesh material={m.ink}><boxGeometry args={[1.65,.38,.14]}/></mesh><TextPlane text={String(label)} width={1.5} lineHeight={.12} position={[0,0,.08]} color="#efd2a4"/></Clickable>)}</>}<Clickable label={running?'この部屋を再挑戦':'任務を開始・再挑戦'} position={[0,1.3,-1.8]} reach={4} onClick={()=>running?action('retry'):send(s.phase==='lobby'?'start':'restart')}><mesh material={m.red}><boxGeometry args={[2,.5,.16]}/></mesh><TextPlane text={running?'この部屋を再挑戦':'歪みの部屋へ'} width={1.8} lineHeight={.17} position={[0,0,.09]} color="#ffe7b0"/></Clickable></group>}
  {stage===0&&REFLEX.map((p,i)=>{const lit=ready&&beat.open&&beat.target===i;return <Clickable key={i} label={`反射の札 ${i+1}`} position={p} reach={3.3} enabled={ready} onClick={()=>action(`hit:${i}`)}><mesh material={lit?m.glow:m.red}><boxGeometry args={[.72,.8,.14]}/></mesh><TextPlane text={`${i+1}\n${['月','波','松'][i]}`} position={[0,0,.085]} width={.6} lineHeight={.21} color={lit?'#241b0e':'#ffe7c0'}/></Clickable>})}
  {stage===1&&<>
   {JUMP_ROUTE.map((p,i)=><Marker key={i} pos={p} active={ready&&ms.progress===i} label={`${i+1} / 4`}/>)}
   <Clickable label={pads?'踏切から高台へ（快適移動）':'踏切から跳躍'} position={[16,.25,5.5]} reach={2.8} enabled={ready&&ms.progress%2===1} onClick={()=>{if(pads)warp([16,3.52,3.8]);else rt.locomotion!.impulse([0,10,0])}}><mesh material={m.red}><cylinderGeometry args={[.85,.85,.2,24]}/></mesh><TextPlane text="跳" position={[0,.12,0]} rotation={[-Math.PI/2,0,0]} width={.8} lineHeight={.4} color="#ffe3ad"/></Clickable>
   <Touch position={[16,.3,5.5]} size={[1.5,2,1.5]} enabled={ready&&pads&&ms.progress%2===1} onEnter={()=>warp([16,3.52,3.8])}/>
   <Pad position={[14.5,3.42,2]} label="床へ降りる" enabled={ready} onEnter={()=>warp([12,.15,7])}/>
  </>}
  {stage===2&&<>
   {LANTERNS.map((p,i)=>!ms.deliveries.includes(i)&&!Object.values(ms.carried).includes(i)&&<group key={i} position={p}><Clickable label={`水中灯籠 ${i+1} を運ぶ`} reach={2.2} enabled={ready&&held===undefined} onClick={()=>action(`take:${i}`)}><mesh material={m.glow}><boxGeometry args={[.32,.45,.32]}/></mesh>{[-.28,.28].map(y=><mesh key={y} position={[0,y,0]} material={m.darkwood}><boxGeometry args={[.5,.1,.5]}/></mesh>)}</Clickable><Touch position={[0,0,0]} size={[1.8,2,1.8]} enabled={ready&&held===undefined} onEnter={()=>action(`take:${i}`)}/></group>)}
   <Marker pos={WATER_BANK} active={ready} label={`受け台 ${ms.deliveries.length}/4`}/>
   <Pad position={[-12.6,.06,-12.4]} label="水底へ潜る" color="#6ddacb" enabled={ready} onEnter={()=>warp(pads?[-12.6,-2.9,-16.6]:[-12,-1.8,-16])}/>
   <Pad position={[-11.2,-2.95,-20.6]} label="灯籠を岸へ運ぶ" color="#6ddacb" enabled={ready} onEnter={()=>warp(WATER_BANK)}/>
   {held!==undefined&&<FaceCamera position={[WATER_BANK[0],1.5,WATER_BANK[2]]}><TextPlane text="灯籠を受け台へ" width={2.5} lineHeight={.18} color="#93f3d9"/></FaceCamera>}
  </>}
  {stage===3&&<>
   {ANCHORS.map((p,i)=><group key={i}><Marker pos={p} active={ready&&ms.charges[i]<chargeSeconds(s)} label={`星 ${i+1}　${Math.round(ms.charges[i]/chargeSeconds(s)*100)}%`}/><mesh position={[p[0],p[1]+.7,p[2]]}><octahedronGeometry args={[.23]}/><meshStandardMaterial color={ms.charges[i]>=chargeSeconds(s)?'#ffe0a0':'#aaa9f1'} emissive="#72649c" emissiveIntensity={.7}/></mesh></group>)}
   {pads&&<><Pad position={[0,.12,-16.2]} label="星 一 へ" enabled={ready} onEnter={()=>warp(ANCHORS[0])}/>{ANCHORS.map((p,i)=><Pad key={i} position={[p[0]+.65,p[1],p[2]+.65]} radius={.33} label={i<2?`星 ${i+2} へ`:'歪みの扉へ'} enabled={running} onEnter={()=>warp(i<2?ANCHORS[i+1]:ROOMS[3].portal)}/>)}</>}
  </>}
  {stage===4&&<>{[0,1,2].map(i=><Marker key={i} pos={gravityPoint(i,!!rt.locomotion)} active={ready&&ms.progress===i} label={`${i+1}　${gravityOpen(s,now)?'今！':'待つ'}`} ceiling={i>0}/>)}</>}
  {room&&ms.cleared&&<Clickable label="歪みの扉をくぐる" enabled={running} reach={3.4} position={visualPortal} onClick={()=>action('next')}><mesh><torusGeometry args={[.6,.075,8,32]}/><meshStandardMaterial color="#edd3a0" emissive="#f4b86a" emissiveIntensity={1.3}/></mesh><mesh position={[0,0,-.03]}><circleGeometry args={[.58,32]}/><meshBasicMaterial color="#b9a2f8" transparent opacity={.32} side={2}/></mesh><FaceCamera position={[0,.9,0]}><TextPlane text={stage===4?'最後の扉 — 庭へ':'歪みの扉 — 次の部屋'} width={2.6} lineHeight={.18} color="#ffe1a5"/></FaceCamera></Clickable>}
  {stage>=5&&<><FaceCamera position={[0,2.5,-9.8]}><TextPlane text="夜風が戻った。最後は庭を駆け抜けろ" width={5} lineHeight={.22} color="#f4dbab"/></FaceCamera><Pad position={[0,.1,16.4]} radius={1} label="屋敷から脱出" enabled={running} onEnter={()=>send('exit')}/></>}
  {device!=='vr'&&running&&<Html fullscreen calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><style>{`body:has(.oboro-help) .oboro-mission{display:none}@media(max-width:680px){.oboro-mission{top:370px!important;bottom:auto!important;width:calc(100vw - 20px)!important;max-height:145px!important;overflow:auto;font-size:11px!important}.oboro-mission button{padding:6px!important}body:has(.oboro-mission) .oboro-movement{display:none}}@media(max-width:680px) and (max-height:740px){.oboro-mission{top:330px!important;max-height:110px!important}}`}</style>
   <div className="oboro-mission" data-testid="mission-panel" data-stage={stage} data-attempt={ms.attempt} style={{position:'absolute',left:'50%',bottom:115,transform:'translateX(-50%)',boxSizing:'border-box',width:350,padding:'12px 15px',background:'#101c2bea',border:'1px solid #c6a97088',borderRadius:6,color:'#eee0c6',fontFamily:'Georgia,"Yu Mincho",serif',fontSize:12,lineHeight:1.65,pointerEvents:'auto'}}>
    <div style={{display:'flex',justifyContent:'space-between'}}><b data-testid="mission-title">{room?`${stage+1}/5　${room.name}`:'終幕　夜風の庭'}</b><span data-testid="mission-time">{room&&!ms.cleared?clock(Math.ceil(Math.max(0,ms.deadline-now)/1000)):'解放'}</span></div>
    <div>{room?.subtitle??'忍者を避け、南の門へ。木刀 J ／ 煙玉 B'}</div>
    {room&&<progress aria-label="部屋の達成度" max={total} value={ms.progress} style={{width:'100%',height:8,accentColor:'#e3be7c'}}/>}
    <div data-testid="mission-feedback" style={{color:ms.failed?'#ffa08a':'#c4d8dd'}}>{ms.notice}{held!==undefined?' ／ 灯籠を運搬中':''}</div>
    {stage===0&&ready&&<div style={{display:'flex',gap:8,marginTop:6}}>{REFLEX.map((_,i)=><button key={i} data-testid={`mission-hit-${i}`} onClick={()=>action(`hit:${i}`)} style={{flex:1,padding:8,color:beat.open&&beat.target===i?'#271d11':'#b1b3bf',background:beat.open&&beat.target===i?'#ffe4a4':'#283343',border:'1px solid #b99865',borderRadius:3,cursor:'pointer'}}>{i+1} {['月','波','松'][i]}</button>)}</div>}
    {stage===4&&!ms.cleared&&<b style={{color:gravityOpen(s,now)?'#c8f7d4':'#e8ae89'}}>{gravityOpen(s,now)?'光の拍子 — 進め！':'影の拍子 — 待つ'}</b>}
    {room&&ms.cleared&&<button data-testid="mission-next" disabled={!nearPortal} onClick={()=>action('next')} style={{width:'100%',padding:8,marginTop:6,background:'#8a6840',color:'#fff0ce',border:0,cursor:'pointer'}}>{nearPortal?(stage===4?'最後の扉から庭へ':'全員で次の部屋へ'):'開いた扉へ近づこう'}</button>}
    {room&&(ms.failed||host)&&!ms.cleared&&<button data-testid="mission-retry" onClick={()=>action('retry')} style={{padding:3,marginTop:5,background:'transparent',border:0,color:'#b5b8ca',cursor:'pointer'}}>{ms.failed?'この部屋を再挑戦（−50点）':'部屋をやり直す（主催者・−50点）'}</button>}
   </div></Html>}
 </>
}
function Marker({pos,active,label,ceiling=false}:{pos:V3;active:boolean;label:string;ceiling?:boolean}){return <group position={pos}><mesh rotation={[ceiling?Math.PI/2:-Math.PI/2,0,0]}><ringGeometry args={[.48,.65,32]}/><meshBasicMaterial color={active?'#f3cf84':'#667889'} transparent opacity={active?.9:.25} side={2}/></mesh>{active&&<FaceCamera position={[0,ceiling?-1.1:1.15,0]}><TextPlane text={label} width={1.9} lineHeight={.16} color="#ffe1a7"/></FaceCamera>}</group>}
