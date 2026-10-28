import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync,writeFileSync } from 'node:fs'
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
 await p.goto(base);await p.getByTestId('play-demo').click();await p.getByTestId('start').waitFor({timeout:60000})
 assert.ok(p.url().includes('/play/'));await p.getByTestId('start').click();await p.getByTestId('message').filter({hasText:'探索開始'}).waitFor({timeout:25000})
 await p.screenshot({path:`${output}/landing-to-play.png`});await p.reload();await p.getByTestId('start').waitFor({timeout:60000})
 assert.equal(await p.evaluate(()=>window.__micRequests),0)
 assert.equal(await p.evaluate(()=>window.__oboro),undefined,'layout debugging is absent without debug=1')
 assert.equal(errors.length,0,errors.join('\n'))
 writeFileSync(`${output}/smoke-results.json`,JSON.stringify({url:base,landingToPlay:true,reload:true,errors},null,2))
}finally{await browser.close()}
for(const script of ['tests/e2e.mjs','tests/traversal.mjs','tests/pages-visual.mjs','tests/graphics-fallback.mjs','tests/lighting.mjs','tests/drag-look.mjs','tests/movement-sync.mjs','tests/stealth-movement.mjs','tests/casual.mjs'])execFileSync(process.execPath,[script],{stdio:'inherit',env:{...process.env,OBORO_TEST_URL:new URL('play/?debug=1',base).href,OBORO_EVIDENCE_DIR:output}})
