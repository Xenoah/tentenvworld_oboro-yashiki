import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useRuntime } from '@tentenv/sdk'
import * as T from 'three'
import { groundSurface, ordinaryGround, quietWindow } from './movement'
import { distance, type GameState, type V3 } from './game'

export type MovementVisual={intensity:number;mode:'idle'|'run'|'jump';dust:number}
const LABELS={sand:'砂',stone:'石',wood:'板床',tatami:'畳',water:'水中',magic:'特殊空間'}
const COUNT=160
export function MovementEffects({state,sound,visual}:{state:GameState;sound:boolean;visual:MutableRefObject<MovementVisual>}){
  const rt=useRuntime(),{gl,scene}=useThree(),latest=useRef(state),lastPose=useRef<V3|null>(null),lastNoise=useRef(0),lastRun=useRef(-1),movementReady=useRef(false),rightButton=useRef(false)
  latest.current=state
  const [display,setDisplay]=useState({surface:'stone' as keyof typeof LABELS,air:false,ready:false,armed:false,missed:false,result:''}),lastUI=useRef('')
  const particles=useMemo(()=>Array.from({length:COUNT},()=>({life:0,max:.8,p:new T.Vector3(),v:new T.Vector3(),size:0})),[])
  const playedSounds=useRef(0),cursor=useRef(0),audio=useRef<T.PositionalAudio[]>([])
  const geometry=useMemo(()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(COUNT*3),3));g.setAttribute('alpha',new T.BufferAttribute(new Float32Array(COUNT),1));g.setAttribute('diameter',new T.BufferAttribute(new Float32Array(COUNT),1));return g},[])
  const material=useMemo(()=>new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{scale:{value:400}},vertexShader:'attribute float alpha;attribute float diameter;varying float opacity;uniform float scale;void main(){opacity=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(diameter*scale/max(.4,-p.z),1.,64.);}',fragmentShader:'varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*3.5)*(1.-smoothstep(.55,1.,r))*opacity;gl_FragColor=vec4(.64,.55,.39,a);}' }),[])
  const brace=()=>{const s=latest.current;if(s.phase==='running')rt.events.emit('oboro:command',{run:s.run,kind:'brace'},'host')}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement|null;if(e.code==='KeyX'&&!e.repeat&&!target?.isContentEditable&&!/INPUT|TEXTAREA|SELECT/.test(target?.tagName??''))brace()}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[rt])
  useEffect(()=>()=>{geometry.dispose();material.dispose();for(const a of audio.current){if(a.isPlaying)a.stop();scene.remove(a);a.disconnect()}},[geometry,material,scene])
  useFrame((_,rawDt)=>{
    const dt=Math.min(.1,rawDt),now=rt.clock().now(),s=latest.current,id=rt.self().peerId,pose=rt.pose(id),running=s.phase==='running'&&now>=s.startedAt
    const reset=lastRun.current!==s.run||!running
    if(reset){movementReady.current=false;playedSounds.current=0;lastRun.current=s.run;lastNoise.current=s.noiseSerial??0;for(const p of particles)p.life=0;lastPose.current=null;visual.current.intensity=0;visual.current.mode='idle';for(const a of audio.current){if(a.isPlaying)a.stop();scene.remove(a);a.disconnect()}audio.current=[]}
    if(pose){
      const moved=lastPose.current?distance(lastPose.current,pose.position):0,teleport=moved>2.3
      const speed=pose.speed??Math.hypot(pose.velocity[0],pose.velocity[2]),air=!pose.grounded&&ordinaryGround(pose.position)
      // A reset/warp's small drop is not a jump. Wait for an actual grounded pose
      // before enabling motion effects, and keep countdown frames exactly clear.
      if(teleport)movementReady.current=false
      if(running&&!reset&&!teleport&&pose.grounded)movementReady.current=true
      const ready=running&&!reset&&!teleport&&movementReady.current
      const mode=ready?(air?'jump':speed>2.8&&moved>.005?'run':'idle'):'idle'
      visual.current.mode=mode;visual.current.intensity=ready?T.MathUtils.damp(visual.current.intensity,mode==='run'?Math.min(1,(speed-2.5)/2):mode==='jump'?.65:0,8,dt):0
      lastPose.current=[...pose.position]
      const m=s.motion?.[id],landing=m?.lastLanding,recent=landing&&!m?.airFrom
      const next={surface:groundSurface(pose.position),air:running&&air,ready:!!m&&quietWindow(m,pose.position),armed:!!m?.braceUsed,missed:!!m?.braceUsed&&!m.braceAt,result:recent?(landing.quiet?'静音着地 成功':'足音が響いた — 忍者に注意'):''}
      const key=JSON.stringify(next);if(key!==lastUI.current){lastUI.current=key;setDisplay(next)}
    }
    const xrButton=!!Array.from(gl.xr.getSession()?.inputSources??[]).find(s=>s.handedness==='right')?.gamepad?.buttons[5]?.pressed
    if(xrButton&&!rightButton.current)brace();rightButton.current=xrButton
    for(const e of s.disturbances??[]){
      if(e.id<=lastNoise.current)continue
      lastNoise.current=e.id;if(!running||reset||now-e.at>1500)continue
      if(e.surface==='sand'){
        const count=e.kind==='run'?9:e.kind==='takeoff'?18:e.quiet?10:28
        for(let i=0;i<count;i++){
          const p=particles[cursor.current++%COUNT],a=(e.id*2.4+i*2.39996),r=.06+(i%5)*.027
          p.p.set(e.pos[0]+Math.cos(a)*r,e.pos[1]+.07,e.pos[2]+Math.sin(a)*r);p.v.set(Math.cos(a)*(.15+(i%4)*.13),.25+(i%7)*.055,Math.sin(a)*(.15+(i%4)*.13));p.life=p.max=.65+(i%4)*.13;p.size=.13+(i%5)*.04
        }
      }
      if(sound&&!e.quiet&&e.radius>0&&rt.audioListener().context.state==='running'){
        const listener=rt.audioListener(),context=listener.context,n=Math.floor(context.sampleRate*.16),buffer=context.createBuffer(1,n,context.sampleRate),samples=buffer.getChannelData(0)
        let seed=e.id+1,low=0;for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low=low*.7+((seed/4294967296)*2-1)*.3;samples[i]=low*Math.exp(-i/n*7)}
        const a=new T.PositionalAudio(listener);a.setBuffer(buffer);a.setRefDistance(2);a.setMaxDistance(28);a.setRolloffFactor(1.4);a.setVolume(Math.min(.5,e.radius/28));a.position.set(...e.pos);scene.add(a);a.play();playedSounds.current++;audio.current.push(a)
      }
    }
    audio.current=audio.current.filter(a=>{if(a.isPlaying)return true;scene.remove(a);a.disconnect();return false})
    const positions=geometry.attributes.position as T.BufferAttribute,alphas=geometry.attributes.alpha as T.BufferAttribute,sizes=geometry.attributes.diameter as T.BufferAttribute;let active=0
    particles.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);if(p.life){active++;p.p.addScaledVector(p.v,dt);p.v.y-=dt*.22}positions.setXYZ(i,p.p.x,p.p.y,p.p.z);alphas.setX(i,p.life?Math.sin(Math.PI*p.life/p.max)*.42:0);sizes.setX(i,p.size*(1.3-p.life/p.max*.3))})
    positions.needsUpdate=alphas.needsUpdate=sizes.needsUpdate=true;material.uniforms.scale.value=gl.domElement.height*.9;visual.current.dust=active
    gl.domElement.dataset.oboroEffectRun=String(s.run);gl.domElement.dataset.oboroFootsteps=String(playedSounds.current);gl.domElement.dataset.oboroDust=String(active);gl.domElement.dataset.oboroMovement=visual.current.mode;gl.domElement.dataset.oboroSurface=pose?groundSurface(pose.position):'none'
  })
  return <><points geometry={geometry} material={material} frustumCulled={false}/>{state.phase==='running'&&<Html fullscreen calculatePosition={(_o,_c,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div className="oboro-movement" style={{position:'absolute',right:24,bottom:62,width:180,color:'#e7ddc6',background:'#102226cc',border:'1px solid #ad946040',padding:'8px 10px',fontFamily:'inherit',fontSize:11,pointerEvents:'auto'}}><style>{'body:has(.oboro-help) .oboro-movement{display:none}@media(max-width:680px){.oboro-movement{bottom:260px!important;right:12px!important;width:205px!important;font-size:11px!important}}'}</style><div data-testid="surface">足場：{LABELS[display.surface]}</div><button data-testid="quiet-landing" disabled={!display.air||display.armed} onClick={brace} style={{width:'100%',margin:'6px 0',padding:6,color:'#f6edd6',background:display.ready?'#426953':'#243d40',border:'1px solid #a98d57',cursor:'pointer'}}>{display.armed?(display.missed?'早すぎた — 足音に注意':'着地の構え'):display.ready?'今、静音着地 [X]':'静音着地 [X]'}</button><div data-testid="landing-feedback">{display.result||'着地直前にX'}</div></div></Html>}</>
}
