import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const ctx=await browser.newContext({viewport:{width:1440,height:960}})
await ctx.addInitScript(()=>localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'high',renderScale:1,autoEnterVR:false})))
const p=await ctx.newPage(),results=[],errors=[];p.on('pageerror',e=>errors.push(e.message))
const record=(name,data={})=>{results.push({name,...data});console.log('PASS',name,JSON.stringify(data))}
const state=()=>p.evaluate(()=>window.__ttvEngine.runtime.state.get('w:oboro:game'))
async function tp(pos,yaw=0,pitch=0){await p.evaluate(({pos,yaw,pitch})=>{const e=window.__ttvEngine;e.runtime.teleport(pos,yaw);e.player.pitch=pitch},{pos,yaw,pitch});await p.waitForFunction(pos=>{const e=window.__ttvEngine,p=e.player.position;return !e.pendingTeleport&&Math.abs(p.x-pos[0])<.6&&Math.abs(p.z-pos[2])<.6},pos,{timeout:25000});await p.waitForTimeout(700)}
async function click(label){await p.evaluate(label=>{const e=window.__ttvEngine,i=[...e.interactables.values()].find(i=>i.spec().label===label);if(!i)throw Error(label);i.spec().onClick({peerId:e.session.selfId,hand:'none',point:[0,0,0]})},label);await p.waitForTimeout(400)}
try{
 await p.goto('http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F');await p.getByTestId('start').waitFor({timeout:40000});await p.waitForTimeout(1000);await p.screenshot({path:'evidence/09-arrival-high.png'});await p.getByTestId('start').click();await p.waitForFunction(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='running')
 await p.getByRole('button',{name:'◉ 快適移動',exact:true}).click();await tp([16,.1,5.6]);await click('踏切台から跳躍')
 await p.keyboard.down('KeyW');await p.waitForFunction(()=>window.__ttvEngine.player.position.y>3.6,null,{timeout:30000,polling:60});const peak=await p.evaluate(()=>window.__ttvEngine.player.position.y);await p.waitForFunction(()=>window.__ttvEngine.player.position.z<4.1,null,{timeout:20000,polling:60});await p.keyboard.up('KeyW');await p.waitForFunction(()=>window.__ttvEngine.player.grounded&&window.__ttvEngine.player.position.y>3.3,null,{timeout:20000,polling:60});record('native jump pad and forward input land on elevated balcony',{observedHeight:peak,landing:await p.evaluate(()=>window.__ttvEngine.localPose().position)})
 await tp([3,.1,7],.25,-.02);await p.locator('canvas').first().click({force:true,position:{x:950,y:550}});await p.waitForTimeout(800);await p.screenshot({path:'evidence/10-courtyard-high.png'})
 const style=await p.addStyleTag({content:'[data-oboro-hud], .hud { display:none !important; }'});await tp([6,.1,7],.55,.04);await p.waitForTimeout(900);await p.screenshot({path:'evidence/11-architecture.png'});await style.evaluate(e=>e.remove());await p.evaluate(()=>document.exitPointerLock())
 // Set an encounter fixture; normal host tick and actual warning/capture logic decide the loss.
 await tp([6,.1,0]);await p.evaluate(()=>{const rt=window.__ttvEngine.runtime,s=structuredClone(rt.state.get('w:oboro:game'));s.startedAt=rt.clock().now()-20000;s.updatedAt=rt.clock().now();s.protectedUntil[rt.self().peerId]=0;s.enemies[0]={pos:[6,0,-.9],target:null,alertAt:0,waypoint:0,mode:'patrol'};s.enemies[1].pos=[-8,0,-8];rt.state.set('w:oboro:game',s)})
 await p.waitForFunction(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').enemies[0].mode==='warning',null,{timeout:10000,polling:50});assert.equal((await state()).phase,'running');await p.screenshot({path:'evidence/12-ninja-warning.png'});await p.waitForFunction(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='lost',null,{timeout:10000});record('ninja warning precedes non-gory capture loss');await p.screenshot({path:'evidence/13-captured.png'})
 await p.getByTestId('start').click();await p.waitForFunction(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='running');
 // Simulate a stock SDK runtime: no optional locomotion capability.
 await p.evaluate(()=>{const e=window.__ttvEngine;e.movementLease=null;delete e.runtime.locomotion});await p.waitForTimeout(600)
 await tp([-13,.1,2]);for(const label of ['月','波','松'])await click(label);await tp([-17,.1,-2]);await click('木の印を取る（仲間全員で共有）');
 await tp([16,.1,5.6]);await click('踏切台から跳躍');await p.waitForFunction(()=>window.__ttvEngine.player.position.y>3,null,{timeout:15000});await click('火の印を取る（仲間全員で共有）')
 await tp([-10,.1,-12]);await click('水門 1 を開く');await tp([-17,.1,-12]);await click('水門 2 を開く');await tp([-12,.1,-12.6]);await click('水牢へ潜る');await p.waitForTimeout(900);await click('水底へ');await p.waitForFunction(()=>window.__ttvEngine.player.position.x< -13,null,{timeout:10000});await click('水の印を取る（仲間全員で共有）');await click('岸へ浮上')
 await tp([0,.1,-15]);await click('浮遊足場 一');await p.waitForTimeout(800);await click('星 1 を灯す');await click('浮遊足場 二');await p.waitForTimeout(800);await click('星 2 を灯す');await click('浮遊足場 三');await p.waitForTimeout(800);await click('星 3 を灯す');await click('空の印へ');await p.waitForTimeout(800);await click('空の印を取る（仲間全員で共有）')
 await tp([11,.1,-15.8]);await click('壁を歩く');await p.waitForTimeout(800);await click('天井へ渡る');await p.waitForTimeout(900);await tp([15.5,4.3,-19.5]);await click('月の印を取る（仲間全員で共有）');await tp([0,.1,16.5]);await click('五印を納め、脱出');await p.waitForFunction(()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='won',null,{timeout:20000});record('stock-capability fallback can collect five seals and escape')
 assert.equal(errors.length,0,errors.join('\n'))
}catch(e){errors.push(String(e));console.error(e);console.log(await state().catch(()=>null));await p.screenshot({path:'evidence/traversal-failure.png'}).catch(()=>{});process.exitCode=1}
finally{writeFileSync('evidence/traversal-results.json',JSON.stringify({testedAt:new Date().toISOString(),runtime:'official client with real movement extension; stock-capability fixture removes optional API',results,errors},null,2));await browser.close()}
