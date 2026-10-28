import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']})
const results=[],errors=[],captures=[],pages=[]
const record=(name,details={})=>{results.push({name,...details});console.log('PASS',name,JSON.stringify(details))}
const ctx=await browser.newContext({viewport:{width:800,height:600}})
const wait=(p,fn,arg=null)=>p.waitForFunction(fn,arg,{timeout:60000,polling:100})
const state=p=>p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game'))
const id=p=>p.evaluate(()=>window.__ttvEngine.runtime.self().peerId)
async function open(guest=false){
 const p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(60000)
 if(guest)await p.setViewportSize({width:800,height:600})
 await p.addInitScript(config=>localStorage.setItem('ttv.settings.v1',JSON.stringify(config)),{quality:'low',renderScale:.5,shadows:false,autoEnterVR:false})
 p.on('pageerror',e=>errors.push(e.message));p.on('crash',()=>errors.push('Browser page crashed'));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
 const started=Date.now();await p.goto(new URL('play/?debug=1',base).href)
 // Shader startup on concurrent software renderers is separate from gameplay waits.
 // Keep the same ready condition; only the startup budget matches the four-client suite.
 await p.waitForFunction(()=>window.__oboro&&window.__ttvEngine?.interactables.size>15,null,{timeout:process.env.CI==='true'?180000:90000,polling:100})
 record('client scene ready',{guest,elapsedMs:Date.now()-started,quality:'low',renderScale:.5,interactables:await p.evaluate(()=>window.__ttvEngine.interactables.size)})
 return p
}
async function tp(p,pos,yaw=0){await p.evaluate(({pos,yaw})=>window.__ttvEngine.runtime.teleport(pos,yaw),{pos,yaw});await wait(p,pos=>{const e=window.__ttvEngine;return !e.pendingTeleport&&Math.hypot(e.player.position.x-pos[0],e.player.position.z-pos[2])<.3},pos);await p.evaluate(()=>document.activeElement?.blur())}
const go=p=>wait(p,()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game');return s.phase==='running'&&r.clock().now()>s.startedAt+200})
async function protect(p){await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));for(const pl of r.players())s.protectedUntil[pl.peerId]=r.clock().now()+600000;r.state.set('w:oboro:game',s)})}
async function walk(p,to,terminal=null){await p.evaluate(to=>{const e=window.__ttvEngine;e.player.yaw=Math.atan2(e.player.position.x-to[0],e.player.position.z-to[1]);document.activeElement?.blur()},to);await p.keyboard.down('KeyW');try{await wait(p,({to,terminal})=>{const e=window.__ttvEngine;return Math.hypot(e.player.position.x-to[0],e.player.position.z-to[1])<.45||(terminal&&e.runtime.state.get('w:oboro:game').phase===terminal)},{to,terminal})}finally{await p.keyboard.up('KeyW')}assert.ok(await p.evaluate(()=>window.__ttvEngine.player.position.y>-.4))}
async function encounter(host,victim){const who=await id(victim);await tp(victim,[6,.1,0]);await host.evaluate(who=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));s.startedAt=r.clock().now()-20000;s.updatedAt=r.clock().now();s.protectedUntil[who]=0;s.enemies[0]={pos:[6,0,-.9],target:null,alertAt:0,waypoint:0,mode:'patrol',yaw:0};s.enemies[1].pos=[-8,0,-8];r.state.set('w:oboro:game',s)},who);await wait(victim,who=>!!window.__ttvEngine.runtime.state.get('w:oboro:game').jailed[who],who);await wait(victim,()=>Math.abs(window.__ttvEngine.player.position.x+15.6)<.4);return who}
async function timeout(p){await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));s.startedAt=r.clock().now()-901000;r.state.set('w:oboro:game',s)});await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='lost')}
async function shot(p,file,releaseScene,fixture){const style=await p.addStyleTag({content:'.hud .notices[style*="40%"] .notice{visibility:hidden!important}'});const before=await p.evaluate(()=>{const e=window.__ttvEngine;return {at:Date.now(),pose:e.localPose(),state:e.runtime.state.get('w:oboro:game'),perf:{calls:window.__ttvPerf.calls,triangles:window.__ttvPerf.triangles,textures:window.__ttvPerf.textures,fps:window.__ttvPerf.fps}}});await p.screenshot({path:`${out}/${file}`,timeout:90000});const after=await state(p);await style.evaluate(e=>e.remove());captures.push({file,releaseScene,hud:'visible; pointer lock hint hidden',position:before.pose.position,fixture,before:{at:before.at,phase:before.state.phase,run:before.state.run,seed:before.state.seed,keys:before.state.keys,jailed:before.state.jailed,enemies:before.state.enemies.map(e=>e.mode)},after:{phase:after.phase,run:after.run,jailed:after.jailed,enemies:after.enemies.map(e=>e.mode)},perf:before.perf})}
try{
 const a=await open(),build=await(await a.request.get(new URL('build.json',base).href)).json()
 await a.getByRole('button',{name:'見習い 8:00',exact:true}).click();await a.getByTestId('start').click();await go(a);await protect(a)
 const firstSeed=(await state(a)).seed;const original=await a.evaluate(()=>window.__oboro.layout());await a.evaluate(()=>{window.__oboro.layout().keyPos.wood[0]=999;window.__oboro.valves()[0].pos[0]=999});assert.deepEqual(await a.evaluate(()=>window.__oboro.layout()),original);assert.notEqual(await a.evaluate(()=>window.__oboro.valves()[0].pos[0]),999);record('debug layout and valve results cannot mutate authoritative cached positions')
 await tp(a,[-10,.1,-6.8]);await walk(a,[-10,-10.8]);assert.equal((await state(a)).recoveries,0);await tp(a,[-9.6,.1,2.5]);await walk(a,[-12,2.5]);record('real keyboard crosses former floor gap and study entrance without rescue')
 await a.getByTestId('objective').waitFor();await a.getByTestId('nav').click();await a.getByTestId('objective').waitFor({state:'hidden'});await a.getByTestId('nav').click();await a.getByTestId('objective').waitFor();record('navigation toggle changes actual objective display')
 await tp(a,[6,.1,7],.65);await shot(a,'casual-courtyard.png','courtyard-navigation','teleport camera and long protection; active generated round, no puzzle state injection')
 const coin=original.coins[0];await tp(a,[coin.pos[0],.1,coin.pos[2]]);await wait(a,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').coins.includes(0));assert.ok((await state(a)).coinPoints>=coin.value);record('touching generated koban awards shared points')
 // Actual capture and automatic solo release: no jail/success state is injected.
 const me=await encounter(a,a);assert.equal((await state(a)).phase,'running');assert.equal((await state(a)).captures,1)
 await wait(a,me=>!window.__ttvEngine.runtime.state.get('w:oboro:game').jailed[me],me);await wait(a,()=>Math.abs(window.__ttvEngine.player.position.x+12.4)<.5);record('solo capture enters cell, stays playable and releases by real timer')
 const b=await open(true),guest=await id(b);await wait(a,()=>window.__ttvEngine.runtime.players().length===2);assert.equal((await state(b)).seed,(await state(a)).seed)
 await encounter(a,b);await tp(a,[-12.8,.1,10]);await wait(b,guest=>!window.__ttvEngine.runtime.state.get('w:oboro:game').jailed[guest],guest);await wait(b,()=>Math.abs(window.__ttvEngine.player.position.x+12.4)<.5);record('teammate touches external lock and rescues guest; both retain round seed')
 // A second real capture gives a stable cell screenshot and tests restart while jailed.
 await encounter(a,b);await tp(a,[-10.7,.1,12],.95);await shot(a,'casual-rescue.png','jail-rescue','actual guest capture; encounter positions and clock fixture; no jail state injection')
 await timeout(a);await a.getByTestId('start').click();await go(a);await wait(b,()=>{const e=window.__ttvEngine;return e.runtime.state.get('w:oboro:game').run===2&&!e.pendingTeleport&&Math.abs(e.player.position.x)<1&&e.player.position.z>11});assert.deepEqual((await state(b)).jailed,{});assert.equal(await b.evaluate(()=>window.__ttvEngine.movementLease),null);assert.notEqual((await state(a)).seed,firstSeed);record('restart while guest jailed resets to spawn, not cell exit; shared jail and movement reset')
 await b.close();await protect(a)
 // Pick up a real smoke bomb, then use the keyboard against a nearby enemy.
 await tp(a,[8.2,.1,1]);await wait(a,()=>{const r=window.__ttvEngine.runtime;return r.state.get('w:oboro:game').held[r.self().peerId]>0})
 await a.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game')),p=r.pose(r.self().peerId).position;s.enemies[0]={pos:[p[0],0,p[2]-2],target:null,alertAt:0,waypoint:0,mode:'patrol',yaw:0};r.state.set('w:oboro:game',s)});await a.keyboard.press('KeyB');await wait(a,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').enemies[0].mode==='stunned');assert.equal((await state(a)).clouds.length,1);record('real smoke pickup and B command consume bomb and stun enemy')
 await timeout(a);await a.getByTestId('mode-sprint').click();await a.getByTestId('start').click();await go(a);await protect(a);assert.equal((await state(a)).mode,'sprint');assert.equal(await a.getByTestId('seals').locator(':scope > div').count(),3);assert.notEqual((await state(a)).seed,firstSeed);await tp(a,[3,.1,7],.2);await shot(a,'casual-sprint-mode.png','three-room-mode','actual visible mode/start controls; teleport camera and protection only');record('visible 疾風 UI starts a fresh three-seal round and clears smoke/coins/jail')
 const s=await state(a);assert.deepEqual(s.coins,[]);assert.deepEqual(s.clouds,[]);assert.deepEqual(s.jailed,{})
 const L=await a.evaluate(()=>({...window.__oboro.layout(),valveSpots:window.__oboro.valves()}))
 const click=async label=>a.evaluate(label=>{const e=window.__ttvEngine,s=[...e.interactables.values()].find(i=>i.spec().label===label)?.spec();if(!s||s.enabled===false)throw Error('Unavailable '+label);s.onClick({peerId:e.runtime.self().peerId,hand:'none',point:[0,0,0]})},label)
 const REST=[[-2,1,-17],[2,2.8,-20],[-2,4.6,-21]]
 for(const key of L.sprint){
   if(key==='wood'){await tp(a,[-13,.1,2]);for(const r of L.runeOrder){await click({moon:'月',wave:'波',pine:'松'}[r]);await a.waitForTimeout(300)}await wait(a,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').door)}
   if(key==='water'){for(const v of L.valveSpots)await tp(a,[v.touch[0],.1,v.touch[2]]);await wait(a,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').valves.length===2)}
   if(key==='void'){for(const i of L.starOrder){await tp(a,REST[i]);await wait(a,i=>window.__ttvEngine.runtime.state.get('w:oboro:game').stars.includes(i),i)}}
   const k=L.keyPos[key],feet={wood:.1,fire:3.5,water:-2.9,void:4.6,moon:5.4}[key];await tp(a,[k[0],feet,k[2]]);await wait(a,key=>window.__ttvEngine.runtime.state.get('w:oboro:game').keys.includes(key),key)
 }
 await tp(a,[0,.1,15.3]);await walk(a,[0,16.1],'won');await wait(a,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='won');const won=await state(a);assert.equal(won.keys.length,3);assert.equal(won.splits.length,3);assert.equal(won.bonus,60);assert.ok(won.score>0);record('generated three-room puzzle order, pickups, bonus/splits and actual escape resolve 疾風 win',{seed:won.seed,keys:won.keys,score:won.score})

 assert.equal(errors.length,0,errors.join('\n'))
 const screenshotMetadata=JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty,capturedAt:new Date().toISOString(),url:base,execution:'Real Chromium, local static release build; public URL not tested',viewport:[800,600],quality:'low',renderScale:.5,shadows:false,captures},null,2)
 writeFileSync(`${out}/casual-screenshots.json`,screenshotMetadata);writeFileSync(`${out}/screenshots.json`,screenshotMetadata)
}catch(e){errors.push(String(e));for(const p of pages.filter(p=>!p.isClosed()))console.error('Casual failure',await p.evaluate(()=>{const e=window.__ttvEngine;return {pose:e?.localPose(),interactables:e?.interactables.size,layoutHook:!!window.__oboro,perf:window.__ttvPerf,state:e?.runtime.state.get('w:oboro:game'),body:document.body.innerText.slice(0,1000)}}).catch(()=>null));throw e}finally{writeFileSync(`${out}/casual-results.json`,JSON.stringify({testedAt:new Date().toISOString(),fixtures:'teleport between test sections; encounter enemy positions, clock and protection. Movement, pickups, capture, rescue and restart use real code.',results,errors},null,2));await browser.close()}
