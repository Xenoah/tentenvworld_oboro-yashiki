import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useDevice } from '@tentenv/sdk'
import * as T from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { STATIC_LAMPS } from './geometry'
import type { MovementVisual } from './MovementEffects'

export type VisualSettings={glow:number;mode:'auto'|'low'|'off';shading:boolean;blur:number}
export const DEFAULT_VISUALS:VisualSettings={glow:.28,mode:'auto',shading:true,blur:.28}
const MotionShader={uniforms:{tDiffuse:{value:null},amount:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;uniform float amount;varying vec2 vUv;void main(){vec2 d=vUv-.5;float edge=smoothstep(.12,.62,length(d));vec4 c=texture2D(tDiffuse,vUv)*.4;for(int i=1;i<=6;i++){float t=float(i)/6.;c+=texture2D(tDiffuse,clamp(vUv-d*t*amount*edge,vec2(0.),vec2(1.)))*.1;}gl_FragColor=c;}'}

/** Artist-authored local sky radiance, prefiltered once for PBR reflections. No remote HDR. */
export function SkyReflections(){
  const {gl,scene}=useThree(),detailed=useThree(s=>s.viewport.dpr>.6),device=useDevice()
  useEffect(()=>{
    if(!detailed||device!=='desktop'||!gl.extensions.get('EXT_color_buffer_float'))return
    const old=scene.environment,oldIntensity=scene.environmentIntensity,w=256,h=128,data=new Float32Array(w*h*4)
    const moon=new T.Vector3(-.45,.75,.35).normalize()
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const lat=(y+.5)/h*Math.PI,lon=(x+.5)/w*Math.PI*2,dy=Math.cos(lat),dx=Math.sin(lat)*Math.cos(lon),dz=Math.sin(lat)*Math.sin(lon)
      const horizon=Math.exp(-Math.abs(dy)*5),m=Math.pow(Math.max(0,dx*moon.x+dy*moon.y+dz*moon.z),180)*7,i=(y*w+x)*4
      data[i]=dy>0?.12+.18*horizon+m*.8:.08
      data[i+1]=dy>0?.19+.22*horizon+m*.9:.065
      data[i+2]=dy>0?.28+.22*horizon+m:.045
      data[i+3]=1
    }
    const texture=new T.DataTexture(data,w,h,T.RGBAFormat,T.FloatType);texture.mapping=T.EquirectangularReflectionMapping;texture.needsUpdate=true
    const pmrem=new T.PMREMGenerator(gl),target=pmrem.fromEquirectangular(texture)
    scene.environment=target.texture;scene.environmentIntensity=.65
    texture.dispose();pmrem.dispose()
    return()=>{scene.environment=old;scene.environmentIntensity=oldIntensity;target.dispose()}
  },[gl,scene,detailed,device])
  return null
}

/** Lightweight halo fallback: one point draw, with an analytic radial falloff. */
function LanternHalos({settings}:{settings:VisualSettings}){
  const {gl}=useThree(),device=useDevice()
  const geometry=useMemo(()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(STATIC_LAMPS.flat(),3));return g},[])
  const mat=useMemo(()=>new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,uniforms:{gain:{value:0},pixelScale:{value:300}},vertexShader:`uniform float pixelScale; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(pixelScale/max(1.0,-p.z),3.0,130.0);}`,fragmentShader:`uniform float gain;void main(){float r=length(gl_PointCoord-.5)*2.0;float a=exp(-r*r*5.0)*(1.0-smoothstep(.2,1.0,r))*gain;gl_FragColor=vec4(1.0,.62,.28,a);}`}),[])
  useFrame(()=>{mat.uniforms.gain.value=settings.mode==='off'||device==='vr'?0:settings.glow*.55;mat.uniforms.pixelScale.value=gl.domElement.height*.8})
  useEffect(()=>()=>{geometry.dispose();mat.dispose()},[geometry,mat])
  return <points geometry={geometry} material={mat} frustumCulled={false}/>
}

export function SoftLighting({settings,motion}:{settings:VisualSettings;motion?:MutableRefObject<MovementVisual>}){
  const {gl,scene,camera,size}=useThree(),device=useDevice(),fx=useRef<{composer:EffectComposer;bloom:UnrealBloomPass;motion:ShaderPass;antialias:ShaderPass;width:number;height:number;dpr:number}|null>(null)
  const initialReset=useRef(gl.info.autoReset)
  const dispose=()=>{if(fx.current){for(const p of fx.current.composer.passes)p.dispose();fx.current.composer.dispose();fx.current=null}gl.info.autoReset=initialReset.current}
  useEffect(()=>dispose,[gl])
  useFrame((_,dt)=>{
    const dpr=gl.getPixelRatio(),quality=device==='desktop'&&!gl.xr.isPresenting&&dpr>.6&&!!gl.extensions.get('EXT_color_buffer_float'),bloomEnabled=quality&&settings.mode==='auto'&&settings.glow>0,enabled=quality&&(bloomEnabled||settings.blur>0)
    const amount=quality?Math.min(.6,settings.blur)*(motion?.current.intensity??0)*.035:0
    gl.domElement.dataset.oboroBlur=String(amount)
    gl.domElement.dataset.oboroGlow=bloomEnabled?'bloom':settings.mode==='off'||settings.glow===0||device==='vr'?'off':'halo'
    if(!enabled){dispose();gl.render(scene,camera);return}
    if(!fx.current){
      const composer=new EffectComposer(gl),bloom=new UnrealBloomPass(new T.Vector2(size.width,size.height),settings.glow,.55,1.15),antialias=new ShaderPass(FXAAShader),motion=new ShaderPass(MotionShader)
      composer.addPass(new RenderPass(scene,camera));composer.addPass(bloom);composer.addPass(motion);composer.addPass(new OutputPass());composer.addPass(antialias)
      fx.current={composer,bloom,motion,antialias,width:0,height:0,dpr:0}
    }
    const f=fx.current;f.bloom.strength=Math.min(.55,settings.glow);f.bloom.enabled=bloomEnabled;f.motion.uniforms.amount.value=amount;f.motion.enabled=amount>.0001
    if(f.width!==size.width||f.height!==size.height||f.dpr!==dpr){f.composer.setPixelRatio(dpr);f.composer.setSize(size.width,size.height);f.antialias.uniforms.resolution.value.set(1/(size.width*dpr),1/(size.height*dpr));f.width=size.width;f.height=size.height;f.dpr=dpr}
    gl.info.autoReset=false;gl.info.reset();f.composer.render(Math.min(dt,.1))
  },1)
  return <><SkyReflections/><LanternHalos settings={settings}/></>
}
