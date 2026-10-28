import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages/movement-sync'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
const errors=[],results=[]
try{
 const ctx=await browser.newContext({viewport:{width:960,height:640}})
 await ctx.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'low',renderScale:.5,shadows:false,autoEnterVR:false})))
 const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:60000,polling:100}),record=name=>{results.push(name);console.log('PASS',name)}
 const open=async()=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await p.goto(new URL('play/?debug=1',base).href);await p.waitForFunction(()=>window.__ttvEngine?.interactables.size>15,null,{timeout:120000,polling:100});return p}
 const state=p=>p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game'))
 const effects=p=>wait(p,()=>document.querySelector('canvas')?.dataset.oboroEffectRun===String(window.__ttvEngine.runtime.state.get('w:oboro:game').run))
 const a=await open();await a.getByTestId('start').click();const b=await open()
 await wait(a,()=>window.__ttvEngine.runtime.players().length===2)
 const bid=await b.evaluate(()=>window.__ttvEngine.runtime.self().peerId)
 // Protection fixture isolates network behavior from capture; noises still use real host observations.
 await a.evaluate(id=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.protectedUntil[id]=rt.clock().now()+180000;rt.state.set('w:oboro:game',s)},bid)
 await b.evaluate(()=>window.__ttvEngine.runtime.teleport([3,.1,7],0));await wait(b,()=>!window.__ttvEngine.pendingTeleport&&window.__ttvEngine.player.grounded)
 await b.keyboard.down('ShiftLeft');await b.keyboard.down('KeyW')
 await wait(a,id=>window.__ttvEngine.runtime.state.get('w:oboro:game').disturbances.some(e=>e.by===id&&e.kind==='run'&&e.surface==='sand'),bid)
 await b.keyboard.up('KeyW');await b.keyboard.up('ShiftLeft')
 const noise=(await state(a)).disturbances.filter(e=>e.by===bid&&e.kind==='run').at(-1);assert.ok(noise)
 await wait(b,id=>window.__ttvEngine.runtime.state.get('w:oboro:game').disturbances.some(e=>e.id===id),noise.id)
 assert.deepEqual((await state(b)).disturbances.find(e=>e.id===noise.id),noise)
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
}catch(e){errors.push(String(e));throw e}finally{writeFileSync(`${output}/movement-sync-results.json`,JSON.stringify({transport:'LocalTransport / BroadcastChannel; three real Chromium tabs in one browser context',results,errors},null,2));await browser.close()}
