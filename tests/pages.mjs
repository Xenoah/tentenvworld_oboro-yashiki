import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync,writeFileSync,copyFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const base=process.env.OBORO_PAGES_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/'
const output=process.env.OBORO_EVIDENCE_DIR||'evidence/pages'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const errors=[]
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:850}})
 await ctx.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'low',renderScale:.5,shadows:false,autoEnterVR:false})))
 await ctx.addInitScript(()=>{window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('Static demo must not request microphone access')}})
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
 await p.goto(base);const previews=await p.evaluate(async()=>{const result=[];for(const a of document.querySelectorAll('audio')){await new Promise((resolve,reject)=>{a.onloadedmetadata=resolve;a.onerror=()=>reject(Error('Preview WAV failed to decode'));a.load()});result.push({duration:a.duration,error:a.error})}return result});assert.equal(previews.length,2);assert.equal(previews[0].duration,72);assert.ok(Math.abs(previews[1].duration-79.041451)<.01);console.log('PASS landing-page WAV previews decode with finite duration',previews);await p.getByTestId('play-demo').click();await p.getByTestId('start').waitFor({timeout:60000})
 assert.ok(p.url().includes('/play/'));await p.getByTestId('start').click();await p.getByTestId('message').filter({hasText:'探索開始'}).waitFor({timeout:25000})
 await p.screenshot({path:`${output}/landing-to-play.png`});await p.reload();await p.getByTestId('start').waitFor({timeout:60000})
 assert.equal(await p.evaluate(()=>window.__micRequests),0)
 assert.equal(await p.evaluate(()=>window.__oboro),undefined,'layout debugging is absent without debug=1')
 assert.equal(errors.length,0,errors.join('\n'))
 writeFileSync(`${output}/smoke-results.json`,JSON.stringify({url:base,landingToPlay:true,reload:true,previews,errors},null,2))
}finally{await browser.close()}
const suite=process.env.OBORO_BROWSER_SUITE||'all'
if(!['all','legacy','mission'].includes(suite))throw Error('Unknown browser suite')
const legacy=['tests/movement-sync.mjs','tests/combat.mjs','tests/casual.mjs','tests/e2e.mjs','tests/traversal.mjs','tests/pages-visual.mjs','tests/graphics-fallback.mjs','tests/lighting.mjs','tests/drag-look.mjs','tests/stealth-movement.mjs','tests/combat-captures.mjs','tests/voice-audio.mjs','tests/voice-integration.mjs','tests/voice-captures.mjs']
const mission=['tests/game-audio.mjs','tests/audio-integration.mjs','tests/missions.mjs','tests/missions-compat.mjs','tests/missions-walk.mjs','tests/missions-captures.mjs']
for(const script of [...(suite!=='mission'?legacy:[]),...(suite!=='legacy'?mission:[])])execFileSync(process.execPath,[script],{stdio:'inherit',env:{...process.env,OBORO_TEST_URL:new URL('play/?debug=1',base).href,OBORO_EVIDENCE_DIR:output}})

// Preserve this release's new-feature captures after the legacy visual regressions finish.
copyFileSync(`${output}/${suite==='legacy'?'voice':'mission'}-screenshots.json`,`${output}/screenshots.json`)
