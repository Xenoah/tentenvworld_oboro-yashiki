import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/',output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages/lighting'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const errors=[],results=[],captures=[]
try{
  const context=await browser.newContext({viewport:{width:1024,height:720}})
  await context.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'high',renderScale:.7,shadows:true,autoEnterVR:false})))
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
  const buildResponse=await p.request.get(new URL('build.json',base).href);assert.ok(buildResponse.ok());const build=await buildResponse.json()
  await p.goto(new URL('play/?debug=1',base).href);await p.getByTestId('start').click({timeout:120000})
  await p.getByTestId('visual-settings').click();await p.getByTestId('glow-off').click()
  const mode=()=>p.locator('canvas').first().getAttribute('data-oboro-glow')
  await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.oboroGlow==='off',null,{polling:100})
  await p.getByTestId('glow-low').click();await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.oboroGlow==='halo',null,{polling:100})
  await p.getByTestId('glow-auto').click();await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.oboroGlow==='bloom',null,{polling:100})
  await p.getByTestId('glow-strength').focus();await p.keyboard.press('Home');await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.oboroGlow==='off',null,{polling:100})
  await p.keyboard.press('End');assert.equal(await p.getByTestId('glow-strength').inputValue(),'0.55')
  // Restore the default strength through real range-key input, then compare saved lighting.
  for(let i=0;i<27;i++)await p.keyboard.press('ArrowLeft')
  await p.getByTestId('visual-settings').click()
  const capture=async(name,pos,yaw)=>{
    await p.evaluate(({pos,yaw})=>{const e=window.__ttvEngine;e.runtime.teleport(pos,yaw);e.player.pitch=-.04},{pos,yaw})
    await p.waitForFunction(()=>!window.__ttvEngine.pendingTeleport,null,{polling:100});await p.waitForTimeout(1800)
    assert.equal(await p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase),'running')
    if(name==='after-courtyard'){await p.screenshot({path:`${output}/play-courtyard.png`,timeout:90000});captures.push({file:'play-courtyard.png',hud:'visible',position:pos,yaw})}
    const style=await p.addStyleTag({content:'[data-oboro-hud],.oboro-movement,.hud,.pointer-lock-hint{visibility:hidden!important}'})
    await p.screenshot({path:`${output}/${name}.png`,timeout:90000});await style.evaluate(e=>e.remove())
    captures.push({file:`${name}.png`,hud:'hidden for visual comparison',position:pos,yaw})
  }
  await capture('after-courtyard',[3,.1,7],.25);await capture('after-study',[-11,.1,3],.6)
  const standardPerf=await p.evaluate(()=>({...window.__ttvPerf}))
  await p.getByTestId('visual-settings').click();await p.getByTestId('glow-low').click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const lowPerf=await p.evaluate(()=>({...window.__ttvPerf}))
  await p.getByTestId('glow-off').click();await p.getByTestId('baked-shading').uncheck();await p.getByTestId('visual-settings').click()
  await capture('bake-off-study',[-11,.1,3],.6)
  await p.getByTestId('visual-settings').click();await p.getByTestId('baked-shading').check();await p.getByTestId('glow-auto').click();await p.getByTestId('visual-settings').click()
  results.push({glowOff:true,lowMode:true,standardBloom:true,strengthZeroDisables:true,strengthBound:.55,bakeToggle:true,restoredMode:await mode(),standardPerf,lowPerf,viewport:[1024,720],quality:'high',renderScale:.7,shadows:true})
  assert.equal(errors.length,0,errors.join('\n'))
  writeFileSync(`${output}/screenshots.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,commit:build.commit,buildDirty:build.dirty??true,capturedAt:new Date().toISOString(),url:base,execution:'Real Chromium on local static server of the release build; not a public-URL playback verification',viewport:[1024,720],quality:'high',renderScale:.7,shadows:true,captures},null,2))
}finally{writeFileSync(`${output}/lighting-results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
