import {useEffect,useRef,useState} from 'react'
import {Html} from '@react-three/drei'
import {Clickable,TextPlane,useDevice,useRuntime,type VoiceEnvironment} from '@tentenv/sdk'
import {acousticZone,voiceZone} from './acousticZones'
const LABEL:Record<VoiceEnvironment,string>={outdoor:'庭・屋外',room:'部屋の残響',narrow:'狭間の反響',underwater:'水中のこもり'}
/** Applies to real received voice streams only; never requests microphone permission. */
export function VoiceZones(){
 const rt=useRuntime(),device=useDevice(),[enabled,setEnabled]=useState(true),[status,setStatus]=useState({zone:'outdoor' as VoiceEnvironment,streams:0}),applied=useRef(new Set<string>())
 useEffect(()=>{
  const api=rt.voiceEffects;if(!api)return
  const update=()=>{
   const me=rt.pose(rt.self().peerId),zone=me?acousticZone(me.head):'outdoor',present=new Set(rt.players().filter(p=>p.peerId!==rt.self().peerId).map(p=>p.peerId))
   for(const id of applied.current)if(!present.has(id)||!enabled){api.setEnvironment(id,null);applied.current.delete(id)}
   for(const id of present){const p=rt.pose(id);if(enabled&&p){api.setEnvironment(id,{preset:voiceZone(zone,acousticZone(p.head)),lightweight:device==='mobile'});applied.current.add(id)}}
   const streams=api.activePeers().length;setStatus(old=>old.zone===zone&&old.streams===streams?old:{zone,streams})
  }
  update();const timer=window.setInterval(update,200)
  return()=>{clearInterval(timer);for(const id of applied.current)api.setEnvironment(id,null);applied.current.clear()}
 },[rt,device,enabled])
 if(device==='vr')return <Clickable label="VC音響の切替" reach={3.3} position={[3,1.35,10.8]} onClick={()=>setEnabled(v=>!v)}><mesh><boxGeometry args={[2,.55,.12]}/><meshStandardMaterial color="#27453f" roughness={.8}/></mesh><TextPlane text={`受信VC音響：${enabled?'入':'切'}\n${LABEL[status.zone]} · ${status.streams}人`} position={[0,0,.07]} width={1.85} lineHeight={.14} color="#e6dfc8"/></Clickable>
 return <Html fullscreen calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><style>{`body:has(.oboro-help) .oboro-voice{display:none}@media(max-width:680px){.oboro-voice{top:156px!important;right:10px!important;font-size:9px!important;max-width:185px!important}}`}</style><div className="oboro-voice" data-testid="voice-zone" style={{position:'absolute',top:145,right:24,maxWidth:240,padding:'7px 10px',border:'1px solid #99b8ac44',borderRadius:4,background:'#14282bd9',color:'#cfdbcc',fontSize:10,lineHeight:1.5,pointerEvents:'auto'}}>
  <button data-testid="voice-effects" disabled={!rt.voiceEffects} onClick={()=>setEnabled(v=>!v)} style={{border:0,padding:0,background:'transparent',color:'inherit',cursor:'pointer'}}>VC音響：{!rt.voiceEffects?'クライアント拡張が必要':enabled?LABEL[status.zone]:'切'}{device==='mobile'&&enabled?'（軽量）':''}</button>
  <div data-testid="voice-streams">受信音声 {status.streams}人{status.streams===0?' · 通話なし':''}</div>
 </div></Html>
}
