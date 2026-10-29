import {selectLegacy} from './select-legacy.mjs'
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']})
const ctx=await browser.newContext({viewport:{width:1024,height:720}}),errors=[],results=[],captures=[],pages=[]
await ctx.addInitScript(()=>{window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('This QA must never request microphone permission')}})
const wait=(p,fn,arg=null)=>p.waitForFunction(fn,arg,{timeout:60000,polling:100}),record=(name,data={})=>{results.push({name,...data});console.log('PASS',name,JSON.stringify(data))}
async function open(quality){const p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(60000);await p.addInitScript(quality=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality,renderScale:quality==='high'?.8:.5,shadows:false,autoEnterVR:false})),quality);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await p.goto(new URL('play/?debug=1',base).href);await selectLegacy(p);await p.waitForFunction(()=>window.__oboro&&window.__ttvEngine?.interactables.size>15,null,{timeout:180000});return p}
async function tp(p,pos,yaw=0){await p.evaluate(({pos,yaw})=>window.__ttvEngine.runtime.teleport(pos,yaw),{pos,yaw});await wait(p,pos=>{const e=window.__ttvEngine;return !e.pendingTeleport&&Math.hypot(e.player.position.x-pos[0],e.player.position.z-pos[2])<.1},pos)}
async function shot(p,file,releaseScene,fixture){const style=await p.addStyleTag({content:'.hud .notices[style*="40%"] .notice{visibility:hidden!important}'}),before=await p.evaluate(()=>{const e=window.__ttvEngine;return {pose:e.localPose(),zone:document.querySelector('[data-testid=voice-zone]').innerText,streams:e.runtime.voiceEffects.activePeers().length,perf:window.__ttvPerf}});await p.screenshot({path:`${out}/${file}`,timeout:90000});await style.evaluate(e=>e.remove());captures.push({file,releaseScene,fixture,...before})}
try{
 const a=await open('low'),build=await(await a.request.get(new URL('build.json',base).href)).json();await a.getByRole('button',{name:'見習い 8:00',exact:true}).click();await a.getByTestId('start').click();await wait(a,()=>{const r=window.__ttvEngine.runtime;return r.clock().now()>r.state.get('w:oboro:game').startedAt});await a.getByTestId('voice-streams').filter({hasText:'0人'}).waitFor()
 const b=await open('low'),bid=await b.evaluate(()=>window.__ttvEngine.runtime.self().peerId);await wait(a,()=>window.__ttvEngine.runtime.players().length===2)
 await a.getByRole('button',{name:'音：切',exact:true}).click()
 const rtc=await a.evaluate(async bid=>{
  const e=window.__ttvEngine,c=e.listener.context;await c.resume();const osc=c.createOscillator(),g=c.createGain(),dest=c.createMediaStreamDestination();osc.frequency.value=800;g.gain.value=.04;osc.connect(g);g.connect(dest);osc.start()
  const stream=dest.stream;e.voice.addRemote(bid,stream)
  const analyser=c.createAnalyser();analyser.fftSize=2048;e.voice.remoteAudio(bid).gain.connect(analyser)
  window.__voiceFixture={bid,stream,osc,g,dest,analyser};return {trackKind:stream.getAudioTracks()[0].kind,source:'generated800Hz -> MediaStream fixture -> actual VoiceManager.addRemote; no network call',microphone:window.__micRequests}
 },bid)
 record('local synthetic stream constructed',rtc);assert.equal(rtc.microphone,0);await wait(a,bid=>{const v=window.__ttvEngine.voice.remoteAudio(bid);return v?.getFilters().length===3&&!!v.parent},bid)
 const rms=()=>a.evaluate(()=>{const x=new Float32Array(2048);window.__voiceFixture.analyser.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((sum,v)=>sum+v*v,0)/x.length)})
 await wait(a,()=>{const x=new Float32Array(2048);window.__voiceFixture.analyser.getFloatTimeDomainData(x);return x.some(v=>Math.abs(v)>1e-5)})
 assert.ok(await rms()>1e-5);record('generated MediaStream fixture flows through actual incoming VoiceManager filters and avatar-head attachment',rtc)
 const before=await a.evaluate(bid=>window.__ttvEngine.voice.remoteAudio(bid).getVolume(),bid)
 await a.evaluate(bid=>{const v=window.__ttvEngine.voice;v.setUserGain(bid,.4);v.setWorldGain(bid,.5)},bid)
 await wait(a,({bid,before})=>Math.abs(window.__ttvEngine.voice.remoteAudio(bid).getVolume()-before*.2)<1e-6,{bid,before})
 await a.evaluate(bid=>window.__ttvEngine.voice.setSilenced(bid,true),bid);await a.waitForTimeout(400);assert.ok(await rms()<1e-7)
 await a.evaluate(bid=>{const v=window.__ttvEngine.voice;v.setSilenced(bid,false);v.setUserGain(bid,1);v.setWorldGain(bid,null)},bid)
 record('received voice keeps per-user/world gain and mute after acoustic filters')
 for(const [pos,yaw,label,cutoff,file,scene]of [
  [[-13,.1,2],.6,'部屋の残響',15000,'voice-room.png','room-voice'],
  [[-17,.1,-3],-.5,'狭間の反響',11000,'voice-narrow.png','narrow-voice'],
  [[-14,-3,-18],.1,'水中のこもり',700,'voice-underwater.png','underwater-voice']]){
  await tp(a,pos,yaw);await a.getByTestId('voice-effects').filter({hasText:label}).waitFor();await wait(a,({bid,cutoff})=>Math.abs(window.__ttvEngine.voice.remoteAudio(bid).getFilters()[0].frequency.value-cutoff)<2,{bid,cutoff})
  await shot(a,file,scene,'actual final 3D build and runtime zone processing; camera teleport; received voice count1 is a generated MediaStream test tone, NOT a network or microphone conversation')
 }
 record('actual player head zones change the received stream lowpass/reverb presets; water cutoff700Hz')
 await a.getByTestId('voice-effects').click();await wait(a,bid=>window.__ttvEngine.voice.remoteAudio(bid).getFilters().length===0,bid)
 await a.getByTestId('voice-effects').click();await wait(a,bid=>window.__ttvEngine.voice.remoteAudio(bid).getFilters().length===3,bid)
 await a.evaluate(bid=>{const e=window.__ttvEngine;e.voice.addRemote(bid,window.__voiceFixture.stream)},bid)
 await wait(a,bid=>{const v=window.__ttvEngine.voice.remoteAudio(bid);return v?.getFilters().length===3&&!!v.parent},bid)
 record('OFF restores direct voice route; replacement stream retains profile and reattaches to avatar')
 await a.evaluate(()=>{const e=window.__ttvEngine,f=window.__voiceFixture;e.voice.removeRemote(f.bid);f.osc.stop();f.dest.stream.getTracks().forEach(t=>t.stop());f.g.disconnect();f.analyser.disconnect()})
 await a.getByTestId('voice-streams').filter({hasText:'0人'}).waitFor();for(const p of [a,b])assert.equal(await p.evaluate(()=>window.__micRequests),0)
 await b.close();await wait(a,()=>window.__ttvEngine.runtime.players().length===1);record('stream/peer teardown clears received count; no microphone calls or permissions requested')
 assert.deepEqual(errors,[]);writeFileSync(`${out}/voice-functional-screenshots.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty,capturedAt:new Date().toISOString(),url:base,execution:'Local final-build Chromium; generated MediaStream fixture through actual receiver graph, no WebRTC transport/microphone/live remote call',viewport:[1024,720],quality:'low',renderScale:.5,shadows:false,captures},null,2))
}catch(e){errors.push(String(e));for(const p of pages)if(!p.isClosed())console.error('Voice diagnostics',await p.evaluate(async()=>{const e=window.__ttvEngine,f=window.__voiceFixture;if(!f)return{body:document.body.innerText.slice(-1000)};const audio=e.voice.remoteAudio(f.bid);return{context:e.runtime.audioListener().context.state,track:f.stream.getTracks().map(t=>({ready:t.readyState,muted:t.muted,enabled:t.enabled})),volume:audio?.getVolume(),parent:!!audio?.parent,filters:audio?.getFilters().map(n=>({type:n.constructor.name,gain:n.gain?.value,cutoff:n.frequency?.value})),body:document.body.innerText.slice(-600)}}).catch(()=>null));throw e}finally{writeFileSync(`${out}/voice-integration-results.json`,JSON.stringify({results,errors,realMicrophoneConversationTested:false,crossDeviceVoiceTested:false},null,2));await browser.close()}
