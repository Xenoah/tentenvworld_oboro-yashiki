import type { V3 } from './game'

export type GroundSurface='sand'|'stone'|'wood'|'tatami'|'water'|'magic'
export type MotionTrack={pos:V3;at:number;grounded:boolean;apex:number;airFrom:number;descending:boolean;braceAt:number;braceUsed:boolean;stepAt:number;lastLanding:{at:number;quiet:boolean;drop:number}|null}
export type Disturbance={id:number;by:string;at:number;pos:V3;kind:'run'|'takeoff'|'landing';surface:GroundSurface;radius:number;quiet:boolean}
export const floorHeight=(p:V3)=>p[0]>14&&p[0]<18&&p[2]>1.4&&p[2]<4.6&&p[1]>2.5?3.42:0
export function groundSurface(p:V3):GroundSurface{
  const [x,y,z]=p
  if(x>-18.4&&x<-9.6&&z>-22.4&&z<-13.6&&y<.6)return 'water'
  if(z<-14&&(Math.abs(x)<4.8||(x>9&&x<21)))return 'magic'
  if(x<-9&&x>-19.2&&Math.abs(z)<6.2)return 'tatami'
  if(Math.abs(x)>8||z>9||y>1)return 'wood'
  if(Math.abs(x)<8&&z>-11&&z<9){
    for(let center=8;center>-11;center-=1.25){const angle=Math.sin(center)*.08,dx=x-1.2,dz=z-center,lx=dx*Math.cos(angle)-dz*Math.sin(angle),lz=dx*Math.sin(angle)+dz*Math.cos(angle);if(Math.abs(lx)<.8&&Math.abs(lz)<.48)return 'stone'}
    if((x>-2.9&&x<-.1&&z>-3.1&&z<1.7)||(x>3.2&&x<6.1&&z>-6.8&&z<-3.7)||(x>-8.3&&x<-6.2&&z>1.7&&z<4.3))return 'stone'
    for(const lx of [-6,6])for(const lz of [-8,-4,0,4])if(Math.abs(x-lx)<.5&&Math.abs(z-lz)<.5)return 'stone'
    return 'sand'
  }
  return 'stone'
}
export const ordinaryGround=(p:V3)=>!['water','magic'].includes(groundSurface(p))
export const quietWindow=(m:MotionTrack,p:V3)=>!m.grounded&&m.descending&&p[1]-floorHeight(p)<=.75&&p[1]-floorHeight(p)>-.2
export const makeMotion=(pos:V3,grounded:boolean,now:number):MotionTrack=>({pos:[...pos],at:now,grounded,apex:pos[1],airFrom:grounded?0:now,descending:false,braceAt:0,braceUsed:false,stepAt:now,lastLanding:null})

/** Host-observed poses decide surface, noise, landing outcome and replay protection. */
export function observeMotion(previous:MotionTrack|undefined,p:{pos:V3;grounded?:boolean;speed?:number},now:number):{motion:MotionTrack;events:Omit<Disturbance,'id'|'by'>[]}{
  const grounded=p.grounded??true,dt=previous?(now-previous.at)/1000:0
  const delta=previous?Math.hypot(...p.pos.map((v,i)=>v-previous.pos[i])):0
  if(!previous||dt<=0||dt>3||delta>Math.max(2.3,Math.min(dt,.5)*9)||!ordinaryGround(p.pos))return {motion:makeMotion(p.pos,grounded,now),events:[]}
  const m:MotionTrack={...previous,pos:[...p.pos],at:now,grounded},events:Omit<Disturbance,'id'|'by'>[]=[]
  const surface=groundSurface(p.pos),emit=(kind:Disturbance['kind'],radius:number,quiet=false,pos=p.pos)=>events.push({at:now,pos:[...pos],kind,surface:groundSurface(pos),radius,quiet})
  if(previous.grounded&&!grounded){m.apex=Math.max(previous.pos[1],p.pos[1]);m.airFrom=now;m.braceAt=0;m.braceUsed=false;m.descending=false;emit('takeoff',surface==='tatami'?3:5,false,previous.pos)}
  if(!grounded){m.apex=Math.max(m.apex,p.pos[1]);m.descending=p.pos[1]<previous.pos[1]-.015}
  if(!previous.grounded&&grounded&&previous.airFrom){
    // The stance belongs to this flight. A stalled renderer must not consume a wall-clock timer
    // while the official physics advances by at most 0.1 seconds per frame.
    const drop=Math.max(0,previous.apex-p.pos[1]),quiet=previous.braceAt>0&&previous.braceUsed
    if(drop>.22){m.lastLanding={at:now,quiet,drop};emit('landing',quiet?0:Math.min(18,8+drop*3)*(surface==='tatami'?.65:1),quiet)}
    m.airFrom=0;m.braceAt=0;m.braceUsed=false;m.descending=false;m.apex=p.pos[1];m.stepAt=now
  }
  const travelled=Math.hypot(p.pos[0]-previous.pos[0],p.pos[2]-previous.pos[2])
  const speed=Math.min(6,Math.max(travelled/Math.max(.05,dt),Number.isFinite(p.speed)?p.speed!:0))
  if(grounded&&previous.grounded&&speed>2.8&&travelled>.035&&now-m.stepAt>=440){emit('run',surface==='tatami'?4:surface==='sand'?8:10);m.stepAt=now}
  return {motion:m,events}
}
