import {test} from 'node:test'
import assert from 'node:assert/strict'
import {COLLISION_BOXES} from '../worlds/oboro/src/geometry.ts'
import {initialState, command, tick, BLOCKERS, ROUTE, type Player} from '../worlds/oboro/src/game.ts'

const inside=(b:{p:number[];s:number[]},x:number,z:number)=>Math.abs(x-b.p[0])<=b.s[0]/2+.01&&Math.abs(z-b.p[2])<=b.s[2]/2+.01
const floorTop=(x:number,z:number)=>Math.max(-Infinity,...COLLISION_BOXES.filter(b=>inside(b,x,z)&&b.s[1]<=.6&&b.p[1]+b.s[1]/2<.3).map(b=>b.p[1]+b.s[1]/2))

test('every walkable point inside the mansion walls has a floor (no void between study and water cell)',()=>{
  const gaps:string[]=[]
  for(let x=-21.2;x<=21.2;x+=.4)for(let z=-25.6;z<=19.4;z+=.4){
    const pool=x>-18.6&&x<-9.4&&z>-22.6&&z<-13.4
    if(pool){if(!COLLISION_BOXES.some(b=>inside(b,x,z)&&b.p[1]+b.s[1]/2>-3.2))gaps.push(`pool ${x.toFixed(1)},${z.toFixed(1)}`);continue}
    if(!(floorTop(x,z)>-.4))gaps.push(`${x.toFixed(1)},${z.toFixed(1)}`)
  }
  assert.deepEqual(gaps.slice(0,8),[],`${gaps.length} floor gaps`)
})
test('study entrance and engawa are passable; hidden alcove is sealed except by the revolving door',()=>{
  const wall=(x:number,z:number)=>COLLISION_BOXES.some(b=>b.s[1]>2&&b.p[1]>1&&Math.abs(x-b.p[0])<=b.s[0]/2+.3&&Math.abs(z-b.p[2])<=b.s[2]/2+.3)
  for(const z of [7,6,5,0,-5,-6,-8,-11])assert.equal(wall(-9.7,z),false,`engawa blocked at z=${z}`)
  for(const z of [5.9,3,1,-5.3,-5.9])assert.equal(wall(-15,z),true,`alcove open at z=${z}`)
})
test('patrol route avoids every blocker and both ninjas sweep the whole courtyard',()=>{
  for(let i=0;i<ROUTE.length;i++){const a=ROUTE[i],b=ROUTE[(i+1)%ROUTE.length]
    for(let t=0;t<=1;t+=.01){const x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t
      assert.ok(!BLOCKERS.some(([x0,x1,z0,z1])=>x>x0-.3&&x<x1+.3&&z>z0-.3&&z<z1+.3),`segment ${i} crosses a blocker at ${x},${z}`)}}
  const host:Player={id:'host',pos:[0,0,12]}
  let s=command(initialState(0,'normal'),{run:0,kind:'start'},host,0,true)
  const seen=s.enemies.map(()=>({x0:99,x1:-99,z0:99,z1:-99}))
  for(let now=200;now<240_000;now+=200){s=tick(s,[host],now);s.startedAt=now-20_000
    s.enemies.forEach((e,i)=>{const r=seen[i];r.x0=Math.min(r.x0,e.pos[0]);r.x1=Math.max(r.x1,e.pos[0]);r.z0=Math.min(r.z0,e.pos[2]);r.z1=Math.max(r.z1,e.pos[2])})}
  for(const r of seen){assert.ok(r.x1-r.x0>10,`x sweep ${JSON.stringify(r)}`);assert.ok(r.z1-r.z0>12,`z sweep ${JSON.stringify(r)}`)}
})
