import {selectLegacy} from './select-legacy.mjs'
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages/drag-look'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const errors=[],results=[]
try{
 const ctx=await browser.newContext({viewport:{width:1024,height:720}})
 await ctx.addInitScript(()=>{
  localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'low',renderScale:.5,shadows:false,autoEnterVR:false}))
  HTMLElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Expected denied-permission fixture','NotAllowedError'))}
 })
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
 const wait=fn=>p.waitForFunction(fn,null,{timeout:60000,polling:100}),pose=()=>p.evaluate(()=>({yaw:window.__ttvEngine.player.yaw,pitch:window.__ttvEngine.player.pitch}))
 await p.goto(new URL('play/?debug=1',base).href);await selectLegacy(p);await p.getByTestId('start').click({timeout:120000})
 await p.mouse.click(500,405);await p.getByTestId('look-help').filter({hasText:'Pointer lock unavailable'}).waitFor()
 assert.equal(await p.evaluate(()=>document.pointerLockElement),null);results.push('denied Pointer Lock shows a clear fallback without browser setting changes')
 await p.getByTestId('drag-look').click();const before=await pose()
 await p.mouse.move(500,405);await p.mouse.down();await p.mouse.move(640,445,{steps:8});await p.mouse.up()
 await p.waitForFunction(y=>Math.abs(window.__ttvEngine.player.yaw-y)>.15,before.yaw,{timeout:20000,polling:100})
 let after=await pose();assert.ok(Math.abs(after.pitch-before.pitch)>.04);assert.equal(await p.evaluate(()=>document.pointerLockElement),null)
 results.push('real unlocked canvas drag changes both camera axes')
 await p.waitForTimeout(600);const stopped=await pose();await p.mouse.move(400,450,{steps:5});await p.waitForTimeout(600);assert.deepEqual(await pose(),stopped)
 await p.getByTestId('visual-settings').click();await p.getByTestId('motion-blur').focus();await p.keyboard.press('Home');await p.getByTestId('visual-settings').click();assert.deepEqual(await pose(),stopped)
 results.push('released mouse and HUD controls do not rotate the camera')
 // Position fixture only: E must use the real ray interaction and authoritative rune command.
 // v1.3 reshuffles the rune order per round: aim at whichever rune is first this round.
 const runeX=await p.evaluate(()=>({moon:-11.8,wave:-13,pine:-14.2})[window.__oboro.layout().runeOrder[0]])
 await p.waitForFunction(()=>{const rt=window.__ttvEngine.runtime,s=rt.state.get('w:oboro:game');return rt.clock().now()>s.startedAt+150},null,{timeout:30000})
 await p.evaluate(x=>{const e=window.__ttvEngine;e.runtime.teleport([x,.1,3],0);e.player.pitch=-.2},runeX)
 await wait(()=>!window.__ttvEngine.pendingTeleport);await p.waitForTimeout(600)
 await p.evaluate(x=>{const e=window.__ttvEngine,p=e.player.head.p;e.player.pitch=Math.atan2(1.2-p.y,Math.hypot(p.x-x,p.z-1))},runeX)
 await p.waitForTimeout(600);await p.keyboard.press('KeyE');await wait(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').rune===1)
 results.push('E interacts with the actual first rune while Pointer Lock remains unavailable')
 await p.screenshot({path:`${output}/drag-look.png`,timeout:60000})
 await p.getByTestId('locked-look').click();await p.getByTestId('look-help').filter({hasText:'Pointer lock unavailable'}).waitFor()
 results.push('switching back handles another denied lock safely')
 assert.equal(errors.length,0,errors.join('\n'))
 console.log('PASS drag fallback',results)
}catch(e){errors.push(String(e));throw e}finally{writeFileSync(`${output}/drag-look-results.json`,JSON.stringify({pointerLockDeniedFixture:true,realMouseKeyboard:true,results,errors},null,2));await browser.close()}
