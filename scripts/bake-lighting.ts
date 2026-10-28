import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as T from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildArchitectureGeometry, STATIC_LAMPS } from '../worlds/oboro/src/geometry.ts'

const meshes=buildArchitectureGeometry(),digest=createHash('sha256')
for(const [name,g]of meshes){digest.update(name);digest.update(Buffer.from(g.attributes.position.array.buffer));digest.update(Buffer.from(g.attributes.normal.array.buffer))}
const geometryHash=digest.digest('hex'),generatorHash=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')
const path='worlds/oboro/public/lighting/architecture.rgba',metaPath='worlds/oboro/src/bake-meta.json'
if(process.argv.includes('--check')){
  const meta=JSON.parse(readFileSync(metaPath,'utf8')),bytes=readFileSync(path)
  if(meta.geometryHash!==geometryHash||meta.generatorHash!==generatorHash||meta.sha256!==createHash('sha256').update(bytes).digest('hex')||meta.bytes!==bytes.length)throw Error('Stale lighting bake: run npm run bake')
  console.log(`Lighting bake verified: ${bytes.length} bytes, ${geometryHash}`)
  process.exit(0)
}
const occluders=mergeGeometries([...meshes].filter(([name])=>name!=='glow').map(([,g])=>g.clone()),false)
const bvh=new MeshBVH(occluders,{maxLeafTris:10}),ray=new T.Ray(),p=new T.Vector3(),n=new T.Vector3(),t=new T.Vector3(),b=new T.Vector3(),v=new T.Vector3()
const samples=24,radius=2.4,lightRange=8,lightScale=8,color=new T.Color('#ffc27d'),cache=new Map<string,number[]>(),parts:Uint8Array[]=[],records:unknown[]=[]
let offset=0,rays=0,aoTotal=0,aoMin=1,aoMax=0,lit=0
for(const [name,g]of meshes){
  const positions=g.attributes.position,normals=g.attributes.normal,data=new Uint8Array(positions.count*4)
  for(let i=0;i<positions.count;i++){
    p.fromBufferAttribute(positions,i);n.fromBufferAttribute(normals,i).normalize()
    const key=[p.x,p.y,p.z,n.x,n.y,n.z].map(x=>Math.round(x*10000)).join(',')+(name==='glow'?'e':'')
    let encoded=cache.get(key)
    if(!encoded){
      ray.origin.copy(p).addScaledVector(n,.025)
      t.set(Math.abs(n.y)<.95?0:1,Math.abs(n.y)<.95?1:0,0).cross(n).normalize();b.crossVectors(n,t)
      let blocked=0
      for(let s=0;s<samples&&name!=='glow';s++){
        const r=Math.sqrt((s+.5)/samples),a=s*2.399963229728653
        ray.direction.copy(n).multiplyScalar(Math.sqrt(1-r*r)).addScaledVector(t,r*Math.cos(a)).addScaledVector(b,r*Math.sin(a)).normalize()
        const hit=bvh.raycastFirst(ray,T.DoubleSide,.01,radius);rays++
        if(hit)blocked+=(1-hit.distance/radius)**2
      }
      const ao=1-.88*blocked/samples;let irradiance=0
      if(name!=='glow')for(const lamp of STATIC_LAMPS){
        v.set(...lamp).sub(ray.origin);const d=v.length();if(d>lightRange||d<.08)continue
        v.divideScalar(d);const cosine=Math.max(0,n.dot(v));if(!cosine)continue
        ray.direction.copy(v);rays++
        if(!bvh.raycastFirst(ray,T.DoubleSide,.01,d-.05))irradiance+=22*cosine/(d*d+.7)*(1-(d/lightRange)**4)
      }
      encoded=[color.r,color.g,color.b].map(c=>Math.round(255*Math.min(1,irradiance*c/lightScale)))
      encoded.push(Math.round(255*ao));cache.set(key,encoded);aoTotal+=ao;aoMin=Math.min(aoMin,ao);aoMax=Math.max(aoMax,ao);if(irradiance>.01)lit++
    }
    data.set(encoded,i*4)
  }
  records.push({name,vertices:positions.count,offset});offset+=data.length;parts.push(data)
  console.log(`Baked ${name}: ${positions.count} vertices; ${rays} rays`,{flush:true})
}
const bytes=Buffer.concat(parts),meta={version:1,format:'RGBA8: RGB static diffuse irradiance / 8, A distance-weighted ambient visibility',geometryHash,generatorHash,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,samples,radius,lightScale,lightRange,lights:STATIC_LAMPS,meshes:records,statistics:{rays,uniqueSamples:cache.size,aoMin,aoMax,aoMean:aoTotal/cache.size,litSamples:lit},limitations:['Static geometry only; rotating door, enemies, players and water are not baked.','Direct lamp diffuse vertex bake plus local AO; no multi-bounce indirect-light lightmap.']}
mkdirSync('worlds/oboro/public/lighting',{recursive:true});writeFileSync(path,bytes);writeFileSync(metaPath,JSON.stringify(meta,null,2)+'\n')
writeFileSync('worlds/oboro/public/lighting/bake-report.json',JSON.stringify(meta,null,2)+'\n')
console.log(JSON.stringify(meta.statistics));console.log(`Saved ${path}: ${bytes.length} bytes`)
