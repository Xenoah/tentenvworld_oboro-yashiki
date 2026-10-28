import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages/movement-sync'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
const errors=[],results=[],pages=[],networkFailures=[]
try{
 const ctx=await browser.newContext({viewport:{width:800,height:600}})
 await ctx.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'low',renderScale:.5,shadows:false,autoEnterVR:false})))
 const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:60000,polling:100}),record=(name,details={})=>{results.push({name,...details});console.log('PASS',name,JSON.stringify(details))}
 const open=async()=>{const p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(60000);if(process.env.OBORO_CPU_THROTTLE)await(await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.OBORO_CPU_THROTTLE)});p.on('pageerror',e=>errors.push(e.message));p.on('crash',()=>errors.push('Browser page crashed'));p.on('requestfailed',r=>networkFailures.push(`${r.failure()?.errorText} ${r.url()}`));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});const started=Date.now();await p.goto(new URL('play/?debug=1',base).href);await p.waitForFunction(()=>window.__ttvEngine?.runtime.state.has('w:oboro:game')&&window.__ttvEngine.interactables.size>15,null,{timeout:process.env.CI==='true'?180000:120000,polling:100});record('movement client scene ready',{elapsedMs:Date.now()-started,viewport:[800,600],renderScale:.5});return p}
 const state=p=>p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game'))
 const effects=p=>wait(p,()=>document.querySelector('canvas')?.dataset.oboroEffectRun===String(window.__ttvEngine.runtime.state.get('w:oboro:game').run))
 const a=await open();await a.getByTestId('start').click();const b=await open()
 await wait(a,()=>window.__ttvEngine.runtime.players().length===2)
 const bid=await b.evaluate(()=>window.__ttvEngine.runtime.self().peerId)
 const round=(await state(a)).run
 for(const p of [a,b]){await wait(p,run=>{const rt=window.__ttvEngine.runtime,s=rt.state.get('w:oboro:game');return s.run===run&&s.phase==='running'&&rt.clock().now()>s.startedAt+200},round);await effects(p)}
 // Protection fixture isolates network behavior from capture; noises still use real host observations.
 await a.evaluate(id=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.protectedUntil[id]=rt.clock().now()+180000;rt.state.set('w:oboro:game',s)},bid)
 await b.evaluate(()=>window.__ttvEngine.runtime.teleport([3,.1,7],0))
 await wait(b,()=>{const e=window.__ttvEngine,p=e.player;return !e.pendingTeleport&&p.grounded&&Math.abs(p.position.x-3)<.04&&Math.abs(p.position.z-7)<.04&&Math.abs(p.position.y)<.04})
 await wait(a,id=>{const rt=window.__ttvEngine.runtime,p=rt.pose(id),m=rt.state.get('w:oboro:game').motion[id];return p?.grounded&&m?.grounded&&Math.abs(p.position[0]-3)<.04&&Math.abs(p.position[2]-7)<.04&&Math.abs(m.pos[1])<.04&&Math.abs(m.pos[0]-3)<.04&&Math.abs(m.pos[2]-7)<.04},bid)
 // Observe actual snapshots as they arrive. The game expires noise after 6.5 seconds;
 // a slow screenshot/renderer must not erase evidence before Node reads both peers.
 for(const p of [a,b])await p.evaluate(id=>{const rt=window.__ttvEngine.runtime;window.__movementEvents=[];window.__movementTrace=[];window.__stopMovementTrace=rt.state.subscribe('w:oboro:game',s=>{const e=window.__ttvEngine,m=s.motion?.[id];window.__movementTrace.push({now:rt.clock().now(),phase:s.phase,run:s.run,jailed:s.jailed,motion:m,pose:rt.pose(id),noiseSerial:s.noiseSerial});if(window.__movementTrace.length>120)window.__movementTrace.shift();for(const n of s.disturbances??[])if(n.by===id&&n.kind==='run'&&n.surface==='sand'&&!window.__movementEvents.some(v=>v.id===n.id))window.__movementEvents.push(structuredClone(n))})},bid)
 await b.bringToFront();await b.evaluate(()=>document.activeElement?.blur())
 await b.keyboard.down('ShiftLeft');await b.keyboard.down('KeyW')
 try{
  await wait(b,()=>{const p=window.__ttvEngine.player;return p.speed>2.8&&p.position.z<6.8&&p.position.z>4.5&&Math.abs(p.position.x-3)<.1})
  record('guest input produces actual sprint displacement on the prepared sand lane')
  await wait(a,()=>window.__movementEvents.length>0)
 }finally{await b.keyboard.up('KeyW');await b.keyboard.up('ShiftLeft')}
 const noise=await a.evaluate(()=>window.__movementEvents[0]);assert.ok(noise)
 await wait(b,id=>window.__movementEvents.some(e=>e.id===id),noise.id)
 assert.deepEqual(await b.evaluate(id=>window.__movementEvents.find(e=>e.id===id),noise.id),noise)
 for(const p of [a,b])await p.evaluate(()=>window.__stopMovementTrace())
 assert.equal(await b.evaluate(()=>Number(document.querySelector('canvas').dataset.oboroBlur)),0)
 record('guest keyboard sprint produces identical host-authored event on both tabs; low quality blur is off')
 const c=await open();await wait(c,id=>window.__ttvEngine.runtime.state.get('w:oboro:game').noiseSerial>=id,noise.id)
 await wait(c,id=>!!window.__ttvEngine.runtime.state.get('w:oboro:game').motion[id],bid)
 await effects(c)
 assert.equal(await c.evaluate(()=>Number(document.querySelector('canvas').dataset.oboroDust)),0)
 record('late join receives noise sequence and motion snapshot without replaying expired dust')
 const serial=(await state(b)).noiseSerial
 await b.evaluate(()=>{const rt=window.__ttvEngine.runtime,run=rt.state.get('w:oboro:game').run;for(const command of [{kind:'noise',radius:999},{kind:'brace'},{kind:'brace',run:run-1}])rt.events.emit('oboro:command',{run,...command},'host')})
 await b.waitForTimeout(1000);assert.equal((await state(b)).noiseSerial,serial);assert.equal((await state(b)).motion[bid].braceUsed,false)
 record('grounded and stale brace plus forged noise requests are rejected over actual event transport')
 await a.close();await wait(b,()=>window.__ttvEngine.runtime.hostId()===window.__ttvEngine.runtime.self().peerId)
 assert.equal((await state(b)).noiseSerial,serial);assert.ok((await state(b)).motion[bid]);record('host exit retains motion and event sequence under new authority')
 await b.evaluate(()=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.startedAt=rt.clock().now()-901000;rt.state.set('w:oboro:game',s)})
 await wait(c,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='lost');await b.getByTestId('start').click()
 await wait(c,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').run===2)
 for(const p of [b,c]){await effects(p);const s=await state(p);assert.equal(s.noiseSerial,0);assert.deepEqual(s.disturbances,[]);assert.equal(await p.evaluate(()=>Number(document.querySelector('canvas').dataset.oboroDust)),0)}
 record('new host restart clears noise and effects on every remaining tab')
 assert.equal(errors.length,0,errors.join('\n'))
}catch(e){errors.push(String(e));for(const [i,p]of pages.entries())if(!p.isClosed())console.error('Movement sync failure',i,JSON.stringify(await p.evaluate(()=>{const e=window.__ttvEngine,rt=e?.runtime;return {url:location.href,body:document.body.innerText.slice(0,1200),now:rt?.clock().now(),self:rt?.self().peerId,host:rt?.hostId(),players:rt?.players().map(p=>p.peerId),pose:e?.localPose(),state:rt?.state.get('w:oboro:game'),perf:window.__ttvPerf,events:window.__movementEvents,trace:window.__movementTrace}}).catch(()=>null)));throw e}finally{writeFileSync(`${output}/movement-sync-results.json`,JSON.stringify({transport:'LocalTransport / BroadcastChannel; three real Chromium tabs in one browser context',results,errors,networkFailures},null,2));await browser.close()}
