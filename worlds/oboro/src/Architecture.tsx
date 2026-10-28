import { useEffect, useMemo } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useWorldEnv } from '@tentenv/sdk'
import * as T from 'three'
import { buildArchitectureGeometry } from './geometry'
import { applyBakedLighting } from './bakedLighting'
import bakeMeta from './bake-meta.json'
import type { V3 } from './game'

const names = ['cedar','darkwood','tatami','plaster','paper','stone','roof','gravel','moss','cloth'] as const
export type Materials = Record<typeof names[number] | 'brass' | 'ink' | 'leaf' | 'glow' | 'red', T.MeshStandardMaterial>
export function useMaterials(): Materials {
  const env = useWorldEnv()
  const detailed = useThree(s=>s.viewport.dpr>.6)
  const maps = useLoader(T.TextureLoader, names.flatMap(n=>[`${n}.webp`,`${n}-normal.webp`,`${n}-rough.webp`].map(f=>env.assetUrl(`textures/${f}`))))
  const result=useMemo(()=>{
    const materials = {} as Materials
    names.forEach((name,i)=>{
      const [map,normalMap,roughnessMap] = maps.slice(i*3,i*3+3)
      for (const t of [map,normalMap,roughnessMap]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy=4 }
      map.colorSpace = T.SRGBColorSpace
      const lacquer=name==='darkwood',wood=name==='cedar',roof=name==='roof'
      const basic={map,normalMap,roughnessMap,roughness:lacquer?.58:wood?.72:roof?.65:.96,normalScale:new T.Vector2(name==='stone'?.55:.35,name==='stone'?.55:.35),color:name==='paper'?'#f0e5d3':'#ffffff'}
      materials[name]=detailed?new T.MeshPhysicalMaterial({...basic,clearcoat:lacquer?.4:wood?.16:roof?.22:0,clearcoatRoughness:lacquer?.35:.55}):new T.MeshStandardMaterial(basic)
    })
    materials.brass = new T.MeshStandardMaterial({color:'#c5a36b',metalness:.86,roughness:.29})
    materials.ink = new T.MeshStandardMaterial({color:'#18282a',roughness:.9})
    materials.leaf = new T.MeshStandardMaterial({color:'#6d3426',roughness:1,side:T.DoubleSide})
    materials.glow = new T.MeshStandardMaterial({color:'#ffdd9b',emissive:'#ffad4d',emissiveIntensity:3.4,roughness:.8})
    materials.red = new T.MeshStandardMaterial({color:'#78392b',roughness:.7})
    return materials
  },[maps,detailed])
  useEffect(()=>()=>Object.values(result).forEach(material=>material.dispose()),[result])
  return result
}

/** The same static mesh buffers feed the offline bake and this batched scene. */
export function Architecture({materials:m,shading=true}:{materials:Materials;shading?:boolean}) {
  const env=useWorldEnv()
  const raw=useLoader(T.FileLoader,env.assetUrl('lighting/architecture.rgba'),loader=>loader.setResponseType('arraybuffer')) as unknown as ArrayBuffer
  const uniforms=useMemo(()=>({ao:{value:1},light:{value:1}}),[])
  const scene=useMemo(()=>{
    const group=new T.Group(),bytes=new Uint8Array(raw)
    for(const [name,g]of buildArchitectureGeometry()){
      const info=bakeMeta.meshes.find(v=>v.name===name)
      if(!info||info.vertices!==g.attributes.position.count||bytes.length!==bakeMeta.bytes)throw Error('Lighting bake does not match architecture; run npm run bake')
      g.setAttribute('bakedLighting',new T.BufferAttribute(bytes.slice(info.offset,info.offset+info.vertices*4),4,true))
      const mat=m[name].clone();applyBakedLighting(mat,uniforms)
      const mesh=new T.Mesh(g,mat);mesh.name=`oboro-static-${name}`;mesh.castShadow=name!=='glow';mesh.receiveShadow=true;group.add(mesh)
    }
    return group
  },[m,raw,uniforms])
  useEffect(()=>{uniforms.ao.value=shading?.8:0;uniforms.light.value=shading?1:0},[shading,uniforms])
  useEffect(()=>()=>{scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose()}})},[scene])
  return <><primitive object={scene}/><Collision/></>
}

function Collision(){
  const boxes: {p:V3;s:V3}[] = [
    // Ground excludes the pool rectangle, providing real underwater depth.
    {p:[5.8,-.28,-1],s:[32.4,.5,42]}, {p:[-16.3,-.28,4.2],s:[11.8,.5,18.6]},
    {p:[-20.4,-.28,-18],s:[3.2,.5,14]}, {p:[-14,-.28,-24.7],s:[9,.5,2.4]},
    {p:[-14,-3.24,-18],s:[8,.3,8]},
    {p:[-18.2,-1.3,-18],s:[.4,3.5,9]}, {p:[-9.8,-1.3,-18],s:[.4,3.5,9]},
    {p:[-14,-1.3,-22.2],s:[8.4,3.5,.4]}, {p:[-14,-1.3,-13.8],s:[8.4,3.5,.4]},
    {p:[0,-.02,-12],s:[39,.15,3]},
    {p:[16,3.25,3],s:[4,.3,3.2]},
    {p:[-19,1.8,0],s:[.2,3.6,12]}, {p:[-14,1.8,-6],s:[10,3.6,.2]}, {p:[-14,1.8,6],s:[10,3.6,.2]},
    {p:[9.5,3,-20],s:[.24,6,10]}, {p:[20.5,3,-20],s:[.2,6,10]}, {p:[15,6,-20],s:[11,.2,10]},
    {p:[-4.5,3.7,-20],s:[.18,7.4,10]}, {p:[4.5,3.7,-20],s:[.18,7.4,10]}, {p:[0,3.7,-25],s:[9,7.4,.18]},
    {p:[-21.6,1.2,-2],s:[.35,2.4,41]}, {p:[21.6,1.2,-2],s:[.35,2.4,41]}, {p:[0,1.3,-26],s:[43.4,2.6,.35]},
    {p:[-1.5,.85,-.7],s:[2.2,1.7,4.2]}, {p:[4.6,.85,-5.2],s:[2.3,1.7,2.5]}, {p:[-7.2,.8,3],s:[1.3,1.6,2]},
  ]
  for(let i=0;i<7;i++)boxes.push({p:[-11,-.25-i*.43,-13.4-i*.5],s:[1.8,.3,.65]})
  return <RigidBody type="fixed" colliders={false}>{boxes.map((b,i)=><CuboidCollider key={i} args={b.s.map(v=>v/2) as V3} position={b.p}/>)}</RigidBody>
}
