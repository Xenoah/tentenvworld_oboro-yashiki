import {chromium} from 'playwright-core'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages/movement'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const errors=[],results=[],captures=[]
let diagnosticPage
try{
 const c=await browser.newContext({viewport:{width:1024,height:720}})
 await c.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'high',renderScale:.7,shadows:false,autoEnterVR:false})))
 const p=await c.newPage();diagnosticPage=p;p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
 if(process.env.OBORO_CPU_THROTTLE)await (await c.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.OBORO_CPU_THROTTLE)})
 const build=await (await p.request.get(new URL('build.json',base).href)).json()
 const wait=fn=>p.waitForFunction(fn,null,{timeout:60000,polling:100}),record=(name,details={})=>{results.push({name,...details});console.log('PASS',name,JSON.stringify(details))}
 const tp=async pos=>{await p.evaluate(pos=>window.__ttvEngine.runtime.teleport(pos,0),pos);await wait(()=>!window.__ttvEngine.pendingTeleport);await p.waitForTimeout(500);await p.evaluate(()=>document.activeElement?.blur())}
 const snap=()=>p.evaluate(()=>{const e=window.__ttvEngine,s=e.runtime.state.get('w:oboro:game');return {state:s,motion:s.motion[e.runtime.self().peerId],pose:e.localPose(),dust:Number(document.querySelector('canvas').dataset.oboroDust),blur:Number(document.querySelector('canvas').dataset.oboroBlur)}})
 const shot=async(file,releaseScene)=>{const hint=await p.addStyleTag({content:'.hud .notices[style*="40%"] .notice{visibility:hidden!important}'});await p.screenshot({path:`${output}/${file}`,timeout:90000});await hint.evaluate(e=>e.remove());const data=await snap();assert.equal(data.state.phase,'running','feature capture must remain in the active round');captures.push({file,releaseScene,hud:'visible; pointer-lock hint hidden for capture',thirdPerson:releaseScene==='sprint',position:data.pose.position,mode:documentMode(data),fixture:'debug teleport and spawn-protection fixture isolate capture from combat; actual keyboard and authoritative game rules for the feature'})}
 function documentMode(data){return {blur:data.blur,dust:data.dust,landing:data.motion?.lastLanding,enemies:data.state.enemies.map(e=>e.mode)}}
 await p.goto(new URL('play/?debug=1',base).href);await p.getByTestId('start').click({timeout:120000});await p.getByRole('button',{name:'音：切',exact:true}).click()
 // Movement/material checks are isolated from combat; the hearing check below explicitly removes protection.
 await p.evaluate(()=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.protectedUntil[rt.self().peerId]=rt.clock().now()+600000;rt.state.set('w:oboro:game',s)})
 await tp([3,.1,7]);await p.keyboard.press('KeyH');await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyW')
 await wait(()=>{const e=window.__ttvEngine,s=e.runtime.state.get('w:oboro:game');return s.disturbances.some(n=>n.kind==='run'&&n.surface==='sand')&&Number(document.querySelector('canvas').dataset.oboroBlur)>.001&&Number(document.querySelector('canvas').dataset.oboroDust)>0})
 await shot('movement-sprint.png','sprint');const perf=await p.evaluate(()=>{const s=window.__ttvPerf;return {calls:s.calls,triangles:s.triangles,textures:s.textures,fps:s.fps,dust:Number(document.querySelector('canvas').dataset.oboroDust),renderer:'SwiftShader; not a hardware GPU benchmark'}});await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft');await p.keyboard.press('KeyH');record('real sprint produces host-authorized sand footsteps, dust and radial blur',perf)
 await p.getByTestId('visual-settings').click();await p.getByTestId('motion-blur').focus();await p.keyboard.press('Home');await p.getByTestId('visual-settings').click()
 await tp([3,.1,7]);await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyW');await wait(()=>window.__ttvEngine.player.speed>3);assert.equal((await snap()).blur,0);await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft');record('blur slider zero disables blur during real sprint')
 await p.getByTestId('visual-settings').click();await p.getByTestId('motion-blur').focus();await p.keyboard.press('End');for(let i=0;i<32;i++)await p.keyboard.press('ArrowLeft');await p.getByTestId('visual-settings').click()
 await tp([3,.1,7]);await wait(()=>window.__ttvEngine.player.grounded);const prior=(await snap()).state.noiseSerial
 await p.evaluate(()=>{window.__quietInput=[];window.addEventListener('keydown',e=>{if(e.code!=='KeyX')return;const rt=window.__ttvEngine.runtime;window.__quietInput.push({now:rt.clock().now(),pose:rt.pose(rt.self().peerId),motion:structuredClone(rt.state.get('w:oboro:game').motion[rt.self().peerId])})},{capture:true,once:false})})
 await p.keyboard.press('Space');await wait(()=>!window.__ttvEngine.player.grounded&&Number(document.querySelector('canvas').dataset.oboroBlur)>.001)
 await wait(()=>{const e=window.__ttvEngine,m=e.runtime.state.get('w:oboro:game').motion[e.runtime.self().peerId];return m?.descending&&!m.grounded&&m.pos[1]<=.75&&m.pos[1]>.05&&!e.player.grounded})
 await p.keyboard.press('KeyX');record('quiet input diagnostics',await p.evaluate(()=>({input:window.__quietInput,now:window.__ttvEngine.runtime.clock().now(),motion:window.__ttvEngine.runtime.state.get('w:oboro:game').motion[window.__ttvEngine.runtime.self().peerId]})))
 await wait(()=>{const e=window.__ttvEngine,m=e.runtime.state.get('w:oboro:game').motion[e.runtime.self().peerId];return !!m?.lastLanding?.quiet})
 let data=await snap();assert.ok(data.state.disturbances.some(n=>n.id>prior&&n.kind==='landing'&&n.quiet&&n.radius===0));record('real jump and timed X produce quiet landing with zero hearing radius')
 await p.getByTestId('landing-feedback').filter({hasText:'静音着地 成功'}).waitFor({timeout:10000})
 await shot('movement-quiet.png','quiet-landing')
 // No client-supplied sound power. Place enemy behind the actual courtyard rock to isolate hearing from sight.
 await tp([-4,.1,0]);await wait(()=>window.__ttvEngine.player.grounded)
 await p.evaluate(()=>{const e=window.__ttvEngine,rt=e.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.startedAt=rt.clock().now()-20000;s.protectedUntil[rt.self().peerId]=0;s.enemies[0]={pos:[1.5,0,0],target:null,alertAt:0,waypoint:0,mode:'patrol'};s.enemies[1].pos=[7,0,-10];s.disturbances=[];rt.state.set('w:oboro:game',s)})
 await p.keyboard.press('Space');await wait(()=>!window.__ttvEngine.player.grounded);await wait(()=>{const e=window.__ttvEngine,m=e.runtime.state.get('w:oboro:game').motion[e.runtime.self().peerId];return m?.lastLanding&&!m.lastLanding.quiet})
 await wait(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').enemies.some(e=>e.mode==='investigate'||e.mode==='search'))
 data=await snap();assert.ok(data.state.disturbances.some(n=>n.kind==='landing'&&!n.quiet&&n.radius>0));record('missed landing makes actual sound event; occluded ninja investigates',{enemy:data.state.enemies[0]})
 await p.evaluate(()=>{const e=window.__ttvEngine,rt=e.runtime,s=structuredClone(rt.state.get('w:oboro:game'));if(s.phase!=='running')throw Error('Hearing test must finish in active round');s.protectedUntil[rt.self().peerId]=rt.clock().now()+600000;rt.state.set('w:oboro:game',s);rt.teleport([3,.1,3],1.1)})
 await wait(()=>!window.__ttvEngine.pendingTeleport);await shot('movement-search.png','ninja-search')
 // A stone path jump must not emit sand particles or a sand surface event.
 await tp([1.2,.1,8]);await wait(()=>window.__ttvEngine.player.grounded);const stoneStart=(await snap()).state.noiseSerial
 await p.keyboard.press('Space');await wait(()=>!window.__ttvEngine.player.grounded);await wait(()=>window.__ttvEngine.player.grounded);await p.waitForTimeout(500)
 data=await snap();const stoneEvents=data.state.disturbances.filter(n=>n.id>stoneStart);assert.ok(stoneEvents.some(n=>n.kind==='landing'));assert.ok(stoneEvents.every(n=>n.surface==='stone'));record('actual stone-path jump creates no sand event')
 const audio=await p.evaluate(()=>({state:window.__ttvEngine.runtime.audioListener().context.state,played:Number(document.querySelector('canvas').dataset.oboroFootsteps)}));assert.equal(audio.state,'running');assert.ok(audio.played>0);record('footstep playback uses actual positional audio nodes without microphone',audio)
 // Game rule resolves a timeout, then visible restart must clear new state and local effects.
 await tp([0,.1,13]);await p.evaluate(()=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.startedAt=rt.clock().now()-901000;rt.state.set('w:oboro:game',s)})
 await p.getByTestId('start').click();await wait(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').run===2&&document.querySelector('canvas')?.dataset.oboroEffectRun==='2')
 data=await snap();assert.equal(data.state.noiseSerial,0);assert.deepEqual(data.state.disturbances,[]);assert.equal(data.dust,0);assert.equal(data.blur,0);record('restart clears noise, dust, blur and landing outcome')
 assert.equal(errors.length,0,errors.join('\n'))
 writeFileSync(`${output}/screenshots.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty??true,capturedAt:new Date().toISOString(),url:base,execution:'Real Chromium on local static server of release build; not public URL verification',viewport:[1024,720],quality:'high',renderScale:.7,shadows:false,captures},null,2))
}catch(e){errors.push(String(e));if(diagnosticPage)console.error('Movement failure state',JSON.stringify(await diagnosticPage.evaluate(()=>{const e=window.__ttvEngine,rt=e?.runtime;return {now:rt?.clock().now(),pose:e?.localPose(),state:rt?.state.get('w:oboro:game'),input:window.__quietInput,perf:window.__ttvPerf}}).catch(()=>null)));throw e}finally{writeFileSync(`${output}/movement-results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
