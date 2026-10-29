import {useEffect,useRef,useState} from 'react'
import {Html} from '@react-three/drei'
import {useThree} from '@react-three/fiber'
import {useRuntime,useDevice,Clickable,TextPlane} from '@tentenv/sdk'
import {attachAudio,play,DEFAULT_AUDIO,type AudioSettings,type SoundEngine} from './audio'
import {TRACKS,type Track} from './score'
import type {GameState} from './game'
import {checkpoint} from './missions'
export function sceneTrack(s:GameState,me:string):Track{
 if(s.phase==='won')return 'escape'
 if(s.phase==='lost'||s.jailed?.[me]||s.mission?.failed)return 'defeat'
 if(s.phase==='running'&&s.enemies.some(e=>e.target===me&&(e.mode==='warning'||e.mode==='chase')))return 'chase'
 if(s.phase!=='running'||s.mode!=='mission')return 'explore'
 return (['reflex','jump','water','void','inverse','escape'] as Track[])[s.mission?.stage??0]??'explore'
}
export function Soundscape({state:s,sound,setSound,open,close}:{state:GameState;sound:boolean;setSound:(v:boolean)=>void;open:boolean;close:()=>void}){
 const rt=useRuntime(),device=useDevice(),{gl}=useThree(),[settings,setSettings]=useState<AudioSettings>(DEFAULT_AUDIO),[nowPlaying,setNowPlaying]=useState('月下の縁側'),engine=useRef<SoundEngine|null>(null),latest=useRef({s,sound,settings});latest.current={s,sound,settings}
 const previous=useRef({run:s.run,failed:!!s.mission?.failed,attempt:s.mission?.attempt,door:s.door,phase:s.phase})
 useEffect(()=>{
  const e=attachAudio(rt.audioListener());engine.current=e
  const update=()=>{const v=latest.current,track=sceneTrack(v.s,rt.self().peerId);e.configure(v.settings,v.sound,(rt.voiceEffects?.activePeers().length??0)>0);e.select(track);setNowPlaying(TRACKS[v.settings.track==='auto'?track:v.settings.track].name+(e.context.state==='running'?'':'（画面操作で再開）'));gl.domElement.dataset.oboroAudio=JSON.stringify(e.stats())}
  const visibility=()=>e.setHidden(document.hidden),resume=()=>{if(latest.current.sound&&rt.audioListener().context.state!=='running')void rt.audioListener().context.resume().then(update).catch(()=>{})}
  update();visibility();const timer=window.setInterval(update,200);document.addEventListener('visibilitychange',visibility);window.addEventListener('pointerdown',resume);window.addEventListener('keydown',resume)
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pointerdown',resume);window.removeEventListener('keydown',resume);e.dispose();engine.current=null;delete gl.domElement.dataset.oboroAudio}
 },[rt,gl])
 useEffect(()=>{const old=previous.current;if(s.run!==old.run)engine.current?.reset();else{if(!!s.mission?.failed&&!old.failed)play(rt.audioListener(),'failure');if(s.mission?.attempt!==old.attempt||s.door!==old.door)play(rt.audioListener(),'door');if(s.phase!==old.phase&&(s.phase==='won'||s.phase==='lost'))play(rt.audioListener(),s.phase==='won'?'success':'failure')}previous.current={run:s.run,failed:!!s.mission?.failed,attempt:s.mission?.attempt,door:s.door,phase:s.phase}},[s.run,s.phase,s.mission?.failed,s.mission?.attempt,s.door,rt])
 if(device==='vr')return <group position={checkpoint(s)}>{[
 [sound?'音：入':'音：切',()=>setSound(!sound)],
 [`BGM ${Math.round(settings.bgm*100)}%`,()=>setSettings({...settings,bgm:settings.bgm>=1?0:settings.bgm<.25?.25:Math.min(1,Math.round(settings.bgm*4+1)/4),bgmMute:false})],
 [`SE ${Math.round(settings.se*100)}%`,()=>setSettings({...settings,se:settings.se>=1?0:settings.se<.25?.25:Math.min(1,Math.round(settings.se*4+1)/4),seMute:false})],
 [settings.arrangement==='miyabi'?'編成：雅':'編成：影',()=>setSettings({...settings,arrangement:settings.arrangement==='miyabi'?'kage':'miyabi'})]
 ].map(([label,fn],i)=><Clickable key={i} label={String(label)} reach={4} position={[2.7,1.8-i*.4,-1.8]} onClick={fn as ()=>void}><mesh><boxGeometry args={[1.8,.32,.1]}/><meshStandardMaterial color="#213c3e"/></mesh><TextPlane text={String(label)} width={1.65} lineHeight={.12} position={[0,0,.06]} color="#f1dfba"/></Clickable>)}</group>
 if(!open)return null
 const button={background:'#304541',color:'#f2e2c1',border:'1px solid #a28a5b',padding:'7px 9px',cursor:'pointer'}
 return <Html fullscreen onOcclude={()=>{ /* A screen-space panel must stay visible when the world origin is behind the camera. */ }} zIndexRange={[16777275,16777275]} calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><section className="oboro-help" data-testid="audio-panel" style={{position:'absolute',right:24,top:165,width:320,maxWidth:'calc(100vw - 32px)',boxSizing:'border-box',maxHeight:'65vh',overflow:'auto',padding:20,zIndex:20,pointerEvents:'auto',background:'#11282bf5',color:'#eee0c4',border:'1px solid #b59855',borderRadius:5,fontSize:12,lineHeight:1.8}}>
 <button onClick={close} style={{...button,float:'right'}}>閉じる</button><strong>屋敷の音楽</strong><div data-testid="now-playing">{sound?nowPlaying:'音：切 — 下の「音：入」で再生'}</div>
 {(['bgm','se'] as const).map(key=><div key={key} style={{marginTop:15}}><label>{key==='bgm'?'BGM':'効果音 SE'} {Math.round(settings[key]*100)}%<input data-testid={`audio-${key}`} aria-label={key==='bgm'?'BGM音量':'SE音量'} type="range" min="0" max="1" step=".01" value={settings[key]} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})} style={{width:'100%'}}/></label><label><input data-testid={`mute-${key}`} type="checkbox" checked={settings[key==='bgm'?'bgmMute':'seMute']} onChange={e=>setSettings({...settings,[key==='bgm'?'bgmMute':'seMute']:e.target.checked})}/> この音をミュート</label></div>)}
 <label style={{display:'block',marginTop:15}}>編成 <select style={{maxWidth:'100%'}} data-testid="audio-arrangement" value={settings.arrangement} onChange={e=>setSettings({...settings,arrangement:e.target.value as AudioSettings['arrangement']})}><option value="miyabi">雅 — 琴・笛・鐘</option><option value="kage">影 — 三味線風・低い太鼓</option></select></label>
 <label style={{display:'block',marginTop:12}}>曲 <select style={{maxWidth:'100%'}} data-testid="audio-track" value={settings.track} onChange={e=>setSettings({...settings,track:e.target.value as AudioSettings['track']})}><option value="auto">自動：部屋と状況に合わせる</option>{Object.entries(TRACKS).map(([id,t])=><option key={id} value={id}>{t.name}</option>)}</select></label>
 <p>9曲 × 2編成。曲は約1.2秒で切り替わります。受信VCがある間はゲーム音を下げます。音量設定はこの参加中だけ保持します。</p><p style={{fontSize:10,color:'#abc0b5'}}>全曲・効果音は自作合成。実楽器の録音ではありません。背景タブでは停止し、戻ると現在の場面から再生します。</p>
 </section></Html>
}
