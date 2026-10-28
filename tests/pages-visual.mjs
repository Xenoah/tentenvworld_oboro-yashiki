import { chromium } from 'playwright-core'
import { writeFileSync,mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/'
const output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const errors=[],results=[]
const softwareCI=process.env.CI==='true'
try{
 for(const mobile of [false,true]){
  const ctx=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{viewport:softwareCI?{width:1024,height:720}:{width:1440,height:960}})
  await ctx.addInitScript(({mobile,softwareCI})=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:mobile?'low':softwareCI?'medium':'high',renderScale:mobile?.5:softwareCI?.7:1,shadows:!mobile&&!softwareCI,autoEnterVR:false})),{mobile,softwareCI})
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
  await p.goto(new URL('play/?debug=1',base).href);await p.getByTestId('start').waitFor({timeout:60000})
  if(mobile){const b=await p.getByTestId('start').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390);await p.getByTestId('start').tap();await p.locator('.touch-stick').waitFor()}
  else await p.getByTestId('start').click()
  await p.waitForFunction(()=>window.__ttvEngine?.runtime.state.get('w:oboro:game')?.phase==='running')
  if(mobile){
   const combat=await p.getByTestId('combat').boundingBox(),movement=await p.locator('.oboro-movement').boundingBox();assert.ok(combat.x>=0&&combat.x+combat.width<=390);assert.ok(combat.y+combat.height<=movement.y||movement.y+movement.height<=combat.y,'combat and landing HUD must not overlap');
   for(const width of [390,320]){await p.setViewportSize({width,height:844});await p.waitForFunction(width=>parseFloat(document.querySelector('[data-testid=voice-zone]').parentElement.style.width)===width,width,{polling:100});const voice=await p.getByTestId('voice-zone').boundingBox(),health=await p.getByTestId('combat').boundingBox();assert.ok(voice.x>=0&&voice.x+voice.width<=width);assert.ok(voice.x>=health.x+health.width||voice.y+voice.height<=health.y||voice.y>=health.y+health.height,'voice controls and combat HUD must not overlap');await p.getByTestId('voice-effects').tap();await p.getByTestId('voice-effects').filter({hasText:'切'}).waitFor();await p.getByTestId('voice-effects').tap()};await p.setViewportSize({width:390,height:844});
   await p.waitForFunction(()=>{const r=window.__ttvEngine.runtime;return r.clock().now()>r.state.get('w:oboro:game').startedAt});await p.getByTestId('attack').tap();await p.waitForFunction(()=>{const r=window.__ttvEngine.runtime;return r.state.get('w:oboro:game').vitals[r.self().peerId].attackSeq>0});
   const b=await p.locator('.touch-stick').boundingBox();const before=await p.evaluate(()=>window.__ttvEngine.player.position.z)
   await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+8)
   await p.waitForFunction(z=>window.__ttvEngine.player.position.z<z-.5,before,{timeout:20000});await p.mouse.up()
   results.push({mobileEmulation:true,startButtonVisible:true,virtualStickPointerMovement:true,realAndroidDeviceTested:false})
  }else{
   await p.evaluate(()=>{const e=window.__ttvEngine;e.runtime.teleport([3,.1,7],.25);e.player.pitch=-.02})
   await p.waitForFunction(()=>!window.__ttvEngine.pendingTeleport);await p.waitForTimeout(1000)
   results.push({desktopQuality:softwareCI?'medium':'high',softwareCI,perf:await p.evaluate(()=>({...window.__ttvPerf}))})
  }
  await p.screenshot({path:`${output}/${mobile?'mobile-portrait':softwareCI?'desktop-ci':'desktop-high'}.png`,timeout:60000});await ctx.close()
 }
 assert.equal(errors.length,0,errors.join('\n'))
}finally{writeFileSync(`${output}/visual-results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
