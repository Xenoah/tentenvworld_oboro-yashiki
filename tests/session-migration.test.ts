import {test} from 'node:test'
import assert from 'node:assert/strict'
import {InstanceSession} from '../apps/client/src/net/session'
import {Emitter,type Transport} from '../apps/client/src/net/transport'
import type {PeerDescriptor,PeerMessage} from '@tentenv/protocol'

test('a successor terminal snapshot arriving before a delayed host-leave is recovered after election',()=>{
 type Wire={from:string;to:string;msg?:PeerMessage;leave?:string}
 const queue:Wire[]=[],all=new Map<string,Fake>()
 class Fake implements Transport{
  readonly self:PeerDescriptor;active=true;readonly r=new Emitter<[string,unknown]>();readonly peersEv=new Emitter<[{kind:'join'|'leave'|'link';peerId:string}]>()
  constructor(readonly selfId:string,joinedAt:number){this.self={peerId:selfId,joinedAt,hostScore:1,ticket:'',user:{id:selfId,handle:selfId,displayName:selfId} as any};all.set(selfId,this)}
  peers(){return [...all.values()].filter(p=>p!==this&&p.active).map(p=>p.self)}
  link(id:string){return all.get(id)?.active?'p2p' as const:'lost' as const}
  sendR(to:string,msg:PeerMessage){for(const p of all.values())if(p!==this&&p.active&&(to==='*'||to===p.selfId))queue.push({from:this.selfId,to:p.selfId,msg:structuredClone(msg)})}
  sendU(){}onR(cb:(from:string,msg:unknown)=>void){return this.r.on(cb)}onU(){return()=>{}}onPeers(cb:(e:{kind:'join'|'leave'|'link';peerId:string})=>void){return this.peersEv.on(cb)}
  setAudioTrack(){}onRemoteAudio(){return()=>{}}setVideoTrack(){}onRemoteVideo(){return()=>{}}serverUp(){return false}onServer(){return()=>{}}rtt(){return null}
  close(){this.active=false;for(const p of all.values())if(p!==this&&p.active)queue.push({from:this.selfId,to:p.selfId,leave:this.selfId})}
 }
 const transports=[new Fake('a',1),new Fake('b',2),new Fake('c',3)]
 const sessions=transports.map(transport=>new InstanceSession({transport,serverKey:null,serverId:null,instanceId:'test',serverClock:null,avatar:{kind:'builtin',id:'akane'},allowContact:'nobody',hostScore:1}))
 const deliver=(wire:Wire)=>{const p=all.get(wire.to);if(!p?.active)return;if(wire.leave)p.peersEv.emit({kind:'leave',peerId:wire.leave});else p.r.emit(wire.from,wire.msg)}
 const flush=()=>{let n=0;while(queue.length){assert.ok(++n<1000,'handshake must settle');deliver(queue.shift()!)}}
 try{
  flush();const [a,b,c]=sessions;assert.deepEqual(sessions.map(s=>s.hostId()),['a','a','a'])
  a.set('w:oboro:game',{phase:'running',hp:50});flush()
  a.close()
  // Only b learns a left. Its one-shot terminal update reaches c before c elects b.
  for(let i=queue.length-1;i>=0;i--)if(queue[i].to==='b')deliver(queue.splice(i,1)[0])
  assert.equal(b.hostId(),'b');b.set('w:oboro:game',{phase:'lost',hp:0})
  for(let i=0;i<queue.length;)if(queue[i].from==='b'&&queue[i].to==='c')deliver(queue.splice(i,1)[0]);else i++
  assert.equal(c.hostId(),'a');assert.deepEqual(c.get('w:oboro:game'),{phase:'running',hp:50},'unrecognized authority still rejected')
  flush();assert.equal(c.hostId(),'b');assert.deepEqual(c.get('w:oboro:game'),{phase:'lost',hp:0},'fresh snapshot requested after election even if terminal host sends no more ticks')
  b.set('w:oboro:game',{phase:'running',run:2,hp:100});flush();assert.deepEqual(c.get('w:oboro:game'),{phase:'running',run:2,hp:100})
 }finally{for(const s of sessions)s.close()}
})
