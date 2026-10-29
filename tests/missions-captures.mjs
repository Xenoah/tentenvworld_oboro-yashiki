import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {advance,solve,state,tp,wait} from './mission-driver.mjs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const ctx=await browser.newContext({viewport:{width:1024,height:720}}),errors=[],captures=[]
await ctx.addInitScript(()=>{localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'high',renderScale:.8,shadows:false,autoEnterVR:false}));window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('No microphone permission')}})
const p=await ctx.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
async function shot(file,releaseScene){await p.waitForTimeout(800);const hide=await p.addStyleTag({content:'.hud .notices[style*="40%"] .notice{visibility:hidden!important}'});const snapshot=await p.evaluate(()=>{const e=window.__ttvEngine,s=e.runtime.state.get('w:oboro:game');return {pose:e.localPose(),stage:s.mission.stage,cleared:s.mission.cleared,keys:s.keys,phase:s.phase,perf:window.__ttvPerf}});await p.screenshot({path:`${out}/${file}`,timeout:90000});await hide.evaluate(e=>e.remove());captures.push({file,releaseScene,...snapshot,fixture:'Real final build, actual input/occupancy completes every room. Position/protection fixtures for camera and safety; no completion/key/score/win injected. Official pointer-help overlay hidden for capture.'})}
try{
 await p.goto(new URL('play/?debug=1',base).href);await wait(p,()=>window.__oboro&&window.__ttvEngine?.runtime.state.has('w:oboro:game'),null,180000);const build=await(await p.request.get(new URL('build.json',base).href)).json()
 await p.getByRole('button',{name:'見習い 12:00',exact:true}).click();await p.getByTestId('start').click()
 for(let stage=0;stage<5;stage++){
  await solve(p)
  if(stage===0){await tp(p,[-11.4,.12,4.6],.45);await shot('mission-study.png','folded-study')}
  if(stage===4){await tp(p,[17,5.78,-17],-.2,false);await shot('mission-inverse.png','inverse-corridor')}
  await advance(p)
 }
 await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));s.protectedUntil[r.self().peerId]=r.clock().now()+600000;r.state.set('w:oboro:game',s)})
 await tp(p,[2,.12,-8],Math.PI-.1);await shot('mission-garden.png','garden-finale')
 assert.equal((await state(p)).mission.stage,5);assert.equal((await state(p)).keys.length,5);assert.equal(await p.evaluate(()=>window.__micRequests),0);assert.deepEqual(errors,[])
 writeFileSync(`${out}/mission-screenshots.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty,capturedAt:new Date().toISOString(),url:base,execution:'Real Chromium final static build; local CI/server execution, not the public TenTen website or VR hardware',viewport:[1024,720],quality:'high',renderScale:.8,shadows:false,captures},null,2))
 console.log('PASS three high-quality mission captures after real room completion')
}finally{await browser.close()}
