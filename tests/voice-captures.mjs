import {selectLegacy} from './select-legacy.mjs'
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const ctx=await browser.newContext({viewport:{width:1024,height:720}}),errors=[],captures=[]
await ctx.addInitScript(()=>{localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'high',renderScale:.8,shadows:false,autoEnterVR:false}));window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('No microphone permission in static demo')}})
const p=await ctx.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
try{
 await p.goto(new URL('play/?debug=1',base).href);await selectLegacy(p);await p.waitForFunction(()=>window.__oboro&&window.__ttvEngine?.interactables.size>15,null,{timeout:180000});const build=await(await p.request.get(new URL('build.json',base).href)).json()
 await p.getByRole('button',{name:'見習い 8:00',exact:true}).click();await p.getByTestId('start').click();await p.waitForFunction(()=>{const r=window.__ttvEngine.runtime;return r.clock().now()>r.state.get('w:oboro:game').startedAt});await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));s.protectedUntil[r.self().peerId]=r.clock().now()+600000;r.state.set('w:oboro:game',s)})
 for(const [pos,yaw,label,file,releaseScene]of [
  [[-11.7,.1,5],.55,'部屋の残響','voice-room.png','room-voice'],
  [[-16,.1,-1.2],.5,'狭間の反響','voice-narrow.png','narrow-voice'],
  [[-14,-3,-18],.1,'水中のこもり','voice-underwater.png','underwater-voice']]){
  await p.evaluate(({pos,yaw})=>window.__ttvEngine.runtime.teleport(pos,yaw),{pos,yaw});await p.getByTestId('voice-effects').filter({hasText:label}).waitFor();await p.getByTestId('voice-streams').filter({hasText:'0人 · 通話なし'}).waitFor()
  const style=await p.addStyleTag({content:'.hud .notices[style*="40%"] .notice{visibility:hidden!important}'}),pose=await p.evaluate(()=>window.__ttvEngine.localPose());await p.screenshot({path:`${out}/${file}`,timeout:90000});await style.evaluate(e=>e.remove());captures.push({file,releaseScene,pose,zone:label,streams:0,fixture:'real gameplay final build; camera teleport and spawn protection; no synthetic voice injected into release captures, Pages has no voice backend'})
 }
 assert.equal(await p.evaluate(()=>window.__micRequests),0);assert.deepEqual(errors,[]);writeFileSync(`${out}/voice-screenshots.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty,capturedAt:new Date().toISOString(),url:base,execution:'Real Chromium local final static build; actual environments and zero live streams, not a remote VC call',viewport:[1024,720],quality:'high',renderScale:.8,shadows:false,captures},null,2));console.log('PASS three high-quality environment captures show honest zero-stream status')
}finally{await browser.close()}
