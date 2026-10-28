import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { V3 } from './game'

export type Surface = 'cedar'|'darkwood'|'tatami'|'plaster'|'paper'|'stone'|'roof'|'gravel'|'moss'|'cloth'|'brass'|'ink'|'leaf'|'glow'|'red'
export const STATIC_LAMPS = [...[-6,6].flatMap(x=>[-8,-4,0,4].map(z=>[x,1.5,z] as V3)), ...[-19,-8,7,20].map(x=>[x,1.5,-10.5] as V3), [-13,2.6,0] as V3, [-2.5,2.8,12] as V3, [2.5,2.8,12] as V3]

/** Shared by the renderer and the offline ray bake. Coordinates are in world metres. */
export function buildArchitectureGeometry(): Map<Surface,T.BufferGeometry> {
    const bins = new Map<Surface,T.BufferGeometry[]>()
    const add = (geo:T.BufferGeometry, mat:Surface, p:V3, rotation:V3=[0,0,0]) => {
      geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1)))
      if(!bins.has(mat))bins.set(mat,[]); if(geo.index){const flat=geo.toNonIndexed();geo.dispose();geo=flat} bins.get(mat)!.push(geo)
    }
    const box=(p:V3,s:V3,mat:Surface='cedar',r:V3=[0,0,0])=>{
      // Finer sampling on broad receivers prevents large triangular light patches.
      const spacing=mat==='paper'?.4:mat==='tatami'||mat==='gravel'||(mat==='stone'&&s[0]>2&&s[2]>2)?.8:1.5
      const g=new T.BoxGeometry(...s, ...s.map(v=>Math.max(1,Math.min(32,Math.ceil(v/spacing)))) as V3)
      // World-scaled UVs give joinery and boards consistent metre-sized grain.
      const uv=g.attributes.uv; const pos=g.attributes.position; const norm=g.attributes.normal
      for(let i=0;i<uv.count;i++){ const a=Math.abs(norm.getX(i))>.5?'z':'x'; const b=Math.abs(norm.getY(i))>.5?'z':'y'; uv.setXY(i,(a==='x'?pos.getX(i):pos.getZ(i))*.7,(b==='y'?pos.getY(i):pos.getZ(i))*.7) }
      add(g,mat,p,r)
    }
    const cyl=(p:V3,r:number,h:number,mat:Surface='darkwood',rot:V3=[0,0,0],top=r,segments=12)=>add(new T.CylinderGeometry(top,r,h,segments),mat,p,rot)
    const stone=(p:V3,s:V3,mat:Surface='stone',seed=0)=>{const g=new T.IcosahedronGeometry(1,Math.max(...s)<.7?0:2);const a=g.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),v=.9+.08*Math.sin(x*9+seed)*Math.cos(z*7-y*5);a.setXYZ(i,x*v,y*v,z*v)}const normals=g.attributes.normal;for(let i=0;i<a.count;i++){const v=new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)).normalize();normals.setXYZ(i,v.x,v.y,v.z)}g.scale(...s);add(g,mat,p,[seed*.3,seed*.8,seed*.2])}
    const beam=(a:V3,b:V3,r:number,mat:Surface='cedar')=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av);const g=new T.CylinderGeometry(r*.8,r,d.length(),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));add(g,mat,av.add(bv).multiplyScalar(.5).toArray() as V3)}
    const shoji=(p:V3,w:number,h:number,angle=0)=>{
      const group=(x:number,y:number,z:number,s:V3,mat:Surface)=>box([p[0]+x*Math.cos(angle)+z*Math.sin(angle),p[1]+y,p[2]-x*Math.sin(angle)+z*Math.cos(angle)],s,mat,[0,angle,0])
      group(0,0,0,[w,h,.045],'paper')
      for(let x=-w/2;x<=w/2+.01;x+=w/5)group(x,0,.035,[.032,h,.06],'darkwood')
      for(let y=-h/2;y<=h/2+.01;y+=h/7)group(0,y,.04,[w,.028,.065],'darkwood')
      group(0,-h/2-.1,0,[w,.19,.10],'cedar')
    }
    const roof=(cx:number,cz:number,w:number,d:number,y:number)=>{
      // Broad ceramic planes, raised ridges, curved eaves and individually rounded tile caps.
      for(const side of [-1,1]){
        box([cx+side*w*.25,y+.8,cz],[w*.58,.16,d+1.4],'roof',[0,0,-side*.29])
        box([cx+side*w*.49,y+.12,cz],[.55,.18,d+1.8],'roof',[0,0,-side*.15])
        for(let z=cz-d/2-.6;z<cz+d/2+.7;z+=.42){
          beam([cx,y+1.55,z],[cx+side*w*.54,y+.16,z],.055,'roof')
        }
        box([cx+side*w*.52,y-.04,cz],[.16,.26,d+1.5],'darkwood')
      }
      cyl([cx,y+1.61,cz],.15,d+1.8,'roof',[Math.PI/2,0,0],.15,16)
      for(const z of [cz-d/2-.7,cz+d/2+.7]){stone([cx,y+1.65,z],[.25,.3,.25],'roof',1);box([cx,y+.8,z],[w*.97,.16,.16],'cedar')}
    }
    const room=(cx:number,cz:number,w:number,d:number,h=3.6,floor=true)=>{
      if(floor)box([cx,-.16,cz],[w,.3,d],'cedar')
      for(const x of [-w/2,w/2])for(const z of [-d/2,d/2]){
        box([cx+x,.1,cz+z],[.62,.3,.62],'stone');box([cx+x,h/2,cz+z],[.25,h,.25],'darkwood')
        box([cx+x,h-.25,cz+z],[.45,.4,.5],'cedar')
      }
      for(const z of [-d/2,d/2]){box([cx,h-.2,cz+z],[w,.28,.24],'darkwood');box([cx,.24,cz+z],[w,.2,.16],'cedar')}
      for(const x of [-w/2,w/2])box([cx+x,h-.2,cz],[.24,.28,d],'darkwood')
      roof(cx,cz,w+1,d,h)
    }
    const lantern=(x:number,z:number,y=0)=>{
      box([x,y+.12,z],[.85,.24,.85],'stone');cyl([x,y+.62,z],.17,.85,'stone',undefined,.22)
      box([x,y+1.15,z],[.7,.14,.7],'stone');box([x,y+1.46,z],[.41,.5,.41],'glow')
      for(const dx of [-.28,.28])for(const dz of [-.28,.28])box([x+dx,y+1.5,z+dz],[.1,.6,.1],'stone')
      cyl([x,y+1.86,z],.66,.36,'stone',undefined,.14,4);stone([x,y+2.13,z],[.13,.18,.13],'stone')
    }
    // Foundation, garden and perimeter.
    box([5.8,-.4,-1],[32.4,.6,43],'stone');box([-16.3,-.4,4.2],[11.8,.6,18.6],'stone');box([-20.3,-.4,-18.5],[3.9,.6,15],'stone');box([-16.3,-.4,-9.45],[11.8,.6,8.7],'stone');box([5.8,-.4,-24.5],[32.4,.6,3],'stone');box([-16.3,-.4,17],[11.8,.6,7],'stone');box([-14.6,-.4,-24.25],[9.2,.6,3.5],'stone');box([0,-.07,-.5],[18,.11,21],'gravel')
    for(const x of [-21.6,21.6]){box([x,1.2,-3.1],[.35,2.4,45.8],'plaster');box([x,2.48,-3.1],[.7,.17,45.8],'roof')}
    box([0,1.2,19.8],[43.4,2.4,.35],'plaster');box([0,2.48,19.8],[44,.17,.7],'roof')
    box([0,1.3,-26],[43.4,2.6,.35],'plaster');box([0,2.65,-26],[44,.18,.8],'roof')
    // Covered southern engawa and imposing gate.
    room(0,12.5,18,5,3.7)
    for(const x of [-9,-6,-3,3,6,9]){box([x,1.7,10],[.18,3.4,.18],'darkwood');shoji([x,1.7,15],2.7,2.7)}
    room(0,17.5,5,3,3.5)
    for(const x of [-2.5,2.5])box([x,1.7,16.5],[.45,3.4,.5],'red')
    box([0,3,16],[5,.45,.45],'red')
    // Side engawa connects the five chambers around the courtyard.
    for(const x of [-9.4,9.4]){
      box([x,.05,-1],[2.8,.18,22],'cedar')
      for(let z=-11;z<10;z+=3){box([x,1.55,z],[.16,3.1,.16],'darkwood');box([x,3.1,z],[3.3,.16,.17],'cedar')}
      box([x,3.4,-1],[3.6,.15,22],'roof')
    }
    // West study, intricate lattice, tatami borders, alcove.
    room(-14,0,10,12)
    for(let xx=-17.6;xx<-9.5;xx+=2.05)for(let zz=-4.8;zz<5;zz+=3.04){box([xx,.025,zz],[1.98,.07,2.96],'tatami');for(const dx of [-.96,.96])box([xx+dx,.07,zz],[.055,.028,2.96],'cloth')}
    for(let z=-4;z<=4;z+=2.65)shoji([-19,1.65,z],2.5,2.7,Math.PI/2)
    for(const z of [-6,6])for(let x=-17.5;x<-10;x+=2.5)shoji([x,1.65,z],2.4,2.7)
    // The revolving door is the only way into the alcove: fixed partitions close both sides.
    shoji([-15,1.65,3.4],5.2,2.7,Math.PI/2);shoji([-15,1.65,-5.4],1.2,2.7,Math.PI/2)
    box([-16.8,1.6,-4.9],[4,.16,.24],'darkwood');box([-17,.1,-4],[3,.2,2],'cedar')
    box([-17,1.3,-5.7],[1.6,2.5,.08],'paper');box([-17,2.6,-5.68],[1.8,.08,.1],'darkwood')
    // Low writing desk, scrolls, inkstone, ceremonial shelves.
    box([-12,.55,-3],[2.5,.12,1.2],'darkwood')
    for(const x of [-13,-11])for(const z of [-3.4,-2.6])box([x,.25,z],[.13,.5,.13],'cedar')
    box([-12,.63,-3],[1,.015,.55],'paper');box([-11.3,.67,-3],[.25,.08,.2],'stone')
    for(let i=0;i<4;i++)cyl([-13.6,.22+i*.17,-4.5],.09,1.1,'paper',[0,0,Math.PI/2])
    // Eastern jump garden: high receiving balcony, drums and rope rails.
    room(15,3,10,12,6)
    box([16,3.25,3],[4,.3,3.2],'cedar')
    for(const x of [14,18]){box([x,1.5,3],[.22,3,.22],'darkwood');box([x,3.8,1.5],[.12,1.1,.12],'darkwood')}
    box([16,4.3,1.5],[4,.1,.13],'darkwood')
    for(let i=0;i<3;i++){cyl([12+i*1.3,.4,0],.48,.75,'cedar',undefined,.45,20);cyl([12+i*1.3,.79,0],.47,.04,'paper',undefined,.47,20)}
    // Water chamber has an actual recessed basin; its floor collider is below the water.
    room(-14,-19,11,11,3.6,false)
    box([-14,-3.1,-18],[8,.25,8],'stone')
    for(const x of [-18.2,-9.8])box([x,-1.3,-18],[.4,3.5,9],'stone')
    for(const z of [-22.2,-13.8])box([-14,-1.3,z],[8.4,3.5,.4],'stone')
    for(let i=0;i<7;i++)box([-11,-.25-i*.43,-13.4-i*.5],[1.8,.3,.65],'stone')
    for(const x of [-17.4,-10.6]){cyl([x,1.6,-23],.11,3.2,'darkwood');beam([x,3.1,-23],[x,2,-14],.05,'brass')}
    // Floating storehouse, exposed structural frame, ropes, hanging crates.
    room(0,-20,9,10,7.5)
    for(const x of [-4.5,4.5]){box([x,3.7,-20],[.18,7.4,10],'plaster');for(let z=-24;z<-15;z+=2)box([x,3.7,z],[.23,7.4,.18],'darkwood')}
    box([0,3.7,-25],[9,7.4,.18],'plaster')
    for(let y=1;y<7;y+=2)box([0,y,-24.8],[9,.18,.22],'darkwood')
    for(let i=0;i<7;i++){const xx=Math.sin(i*4.3)*2.8,zz=-20+Math.cos(i*2.4)*3,yy=1.4+(i%3)*1.7;box([xx,yy,zz],[.8,.8,.8],'cedar',[.1*i,.23*i,.12*i]);cyl([xx,(yy+7.3)/2,zz],.013,7.3-yy,'cloth')}
    // Climbing room, decorative gold ceiling and carved ribs.
    room(15,-20,11,10,6)
    box([9.5,3,-20],[.24,6,10],'plaster');box([15,6,-20],[11,.2,10],'cedar');box([20.5,3,-20],[.2,6,10],'plaster')
    for(let z=-24;z<-15;z+=1.4){box([9.7,3,z],[.12,5.8,.12],'darkwood');box([15,5.86,z],[10.7,.16,.13],'darkwood')}
    for(let y=.7;y<6;y+=.65)box([9.68,y,-18],[.15,.08,2.2],'brass')
    // Northern approach deck, deliberately broad and step free.
    box([0,-.02,-12],[39,.15,3],'cedar')
    for(const x of [-19,-8,7,20]){box([x,1.5,-12],[.2,3,.2],'darkwood');lantern(x,-10.5)}
    // Stone garden islands are also AI sight blockers.
    for(const [x,z,sx,sz] of [[-1.5,-.7,1.1,2.1],[4.6,-5.2,1.15,1.2],[-7.2,3,.65,1]] as number[][]){
      box([x,.12,z],[sx*2,.2,sz*2],'moss');stone([x,1.05,z],[sx,1.25,sz],'stone',x)
      for(let i=0;i<5;i++)stone([x+Math.sin(i*2)*sx,.25,z+Math.cos(i*3)*sz],[.35,.26,.4],'moss',i)
    }
    // Folding screens (byobu): zigzag paper panels in lacquer frames; ninjas cannot see through them.
    for(const [cx,cz] of [[3,3],[-2.5,-6.5]]){
      for(let i=0;i<6;i++){const x=cx-.835+i*.334,a=i%2?.42:-.42
        box([x,.95,cz],[.34,1.6,.03],'paper',[0,a,0]);box([x,1.77,cz],[.36,.06,.06],'darkwood',[0,a,0]);box([x,.13,cz],[.36,.06,.06],'darkwood',[0,a,0])}
      box([cx,.05,cz],[2.1,.1,.34],'darkwood')
    }
    // Stone stepping path and gravel raking lines.
    for(let z=8;z>-11;z-=1.25){box([1.2,.03,z],[1.5,.1,.85],'stone',[0,Math.sin(z)*.08,0])}
    for(const x of [-6,6])for(let z=-8;z<8;z+=4)lantern(x,z)
    // Bamboo groves and Japanese maple. Lightweight faceted leaf clumps avoid alpha overdraw.
    for(const side of [-1,1])for(let i=0;i<17;i++){
      const x=side*(side>0?20.75+(i%3)*.25:19.8+(i%3)*.3),z=7-i*1.9,h=3.2+(i%4)*.35,spread=side>0?.25:.45
      cyl([x,h/2,z],.06,h,'moss',undefined,.04,8)
      for(let y=.4;y<h;y+=.38)cyl([x,y,z],.065,.025,'darkwood',undefined,.065,8)
      for(let j=0;j<3;j++)stone([x+Math.sin(i+j)*spread,h-.6+j*.2,z+.2],[.52,.13,.42],'moss',i+j)
    }
    beam([-4,0,1],[-4.5,3.8,1.6],.19,'darkwood')
    for(let i=0;i<13;i++){
      const a=i*2.4,r=1.2+(i%3)*.4,xx=-4+Math.cos(a)*r,zz=1+Math.sin(a)*r,yy=3.3+(i%4)*.32
      beam([-4.5,2.5,1.6],[xx,yy,zz],.055,'darkwood')
      for(let j=0;j<95;j++){
        const a=j*2.399, r=Math.sqrt((j+.5)/95), lx=xx+Math.cos(a)*r, lz=zz+Math.sin(a)*r*.8, ly=yy+Math.sin(j*7.1)*.3
        const leaf=new T.CircleGeometry(.11,5);leaf.scale(1,.55,1);add(leaf,'leaf',[lx,ly,lz],[Math.PI/2+Math.sin(j)*.5,j*1.2,0])
      }
    }
    // Wall foundation details, bronze nail heads and skirting.
    for(let x=-20;x<=20;x+=1.2)for(const z of [9.9,-11.9])cyl([x,.14,z],.025,.02,'brass',undefined,.025,8)

    // Paper lanterns are also the origins of the static diffuse-light bake.
    for(const [x,y,z] of STATIC_LAMPS.slice(12)){cyl([x,y,z],.27,.52,'glow',undefined,.27,16);for(const dy of [-.3,.3])cyl([x,y+dy,z],.29,.05,'darkwood');cyl([x,y+.65,z],.016,.8,'darkwood')}
    const result = new Map<Surface,T.BufferGeometry>()
    for(const [name,geos] of bins){result.set(name,mergeGeometries(geos,false));geos.forEach(g=>g.dispose())}
    return result
}

/** Static colliders, shared with tests that check the walkable floor has no gaps. */
export const COLLISION_BOXES: {p:V3;s:V3}[] = (()=>{const boxes: {p:V3;s:V3}[] = [
  // Ground excludes the pool rectangle, providing real underwater depth.
  {p:[5.8,-.28,-1],s:[32.4,.5,42]}, {p:[-16.3,-.28,4.2],s:[11.8,.5,18.6]},
  {p:[-20.3,-.28,-18.5],s:[3.9,.5,15]}, {p:[-14.6,-.28,-24.25],s:[9.2,.5,3.5]},
  {p:[-14,-3.24,-18],s:[8,.3,8]}, {p:[-16.3,-.28,-9.45],s:[11.8,.5,8.7]},
  {p:[5.8,-.28,-24],s:[32.4,.5,4]}, {p:[-16.3,-.28,17],s:[11.8,.5,7]}, {p:[0,1.2,19.8],s:[43.4,2.4,.35]},
  {p:[-18.2,-1.3,-18],s:[.4,3.5,9]}, {p:[-9.8,-1.3,-18],s:[.4,3.5,9]},
  {p:[-14,-1.3,-22.2],s:[8.4,3.5,.4]}, {p:[-14,-1.3,-13.8],s:[8.4,3.5,.4]},
  {p:[0,-.02,-12],s:[39,.15,3]},
  {p:[16,3.25,3],s:[4,.3,3.2]},
  {p:[-19,1.8,0],s:[.2,3.6,12]}, {p:[-15,1.8,-6],s:[8,3.6,.2]}, {p:[-15,1.8,6],s:[8,3.6,.2]},
  {p:[-15,1.8,3.4],s:[.2,3.6,5.2]}, {p:[-15,1.8,-5.4],s:[.2,3.6,1.2]},
  {p:[9.5,3,-20],s:[.24,6,10]}, {p:[20.5,3,-20],s:[.2,6,10]}, {p:[15,6,-20],s:[11,.2,10]},
  {p:[-4.5,3.7,-20],s:[.18,7.4,10]}, {p:[4.5,3.7,-20],s:[.18,7.4,10]}, {p:[0,3.7,-25],s:[9,7.4,.18]},
  {p:[-21.6,1.2,-3.1],s:[.35,2.4,45.8]}, {p:[21.6,1.2,-3.1],s:[.35,2.4,45.8]}, {p:[0,1.3,-26],s:[43.4,2.6,.35]},
  {p:[-1.5,.85,-.7],s:[2.2,1.7,4.2]}, {p:[4.6,.85,-5.2],s:[2.3,1.7,2.5]}, {p:[-7.2,.8,3],s:[1.3,1.6,2]},
  ]
  for(let i=0;i<7;i++)boxes.push({p:[-11,-.25-i*.43,-13.4-i*.5],s:[1.8,.3,.65]})
  for(const [cx,cz] of [[3,3],[-2.5,-6.5]])boxes.push({p:[cx,.9,cz],s:[2.05,1.8,.32]})
  return boxes})()
