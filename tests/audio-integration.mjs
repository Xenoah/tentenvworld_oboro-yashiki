import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {wait,state} from './mission-driver.mjs'
const url=process.env.OBORO_TEST_URL||'http://localhost:5192/tentenvworld_oboro-yashiki/play/?debug=1',out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const context=await browser.newContext({viewport:{width:1024,height:720}});await context.addInitScript(()=>{localStorage.setItem('ttv.settings.v1',JSON.stringify({quality:'low',renderScale:.4,shadows:false,autoEnterVR:false}));window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('No microphone permission')}})
const p=await context.newPage(),errors=[];p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})
const stats=()=>p.evaluate(()=>JSON.parse(document.querySelector('canvas[data-oboro-audio]').dataset.oboroAudio));const until=async(fn)=>{for(let i=0;i<80;i++){const s=await stats();if(fn(s))return s;await p.waitForTimeout(250)}throw Error('Audio condition failed '+JSON.stringify(await stats()))}
try{
 await p.goto(url);await p.getByTestId('start').waitFor();await until(s=>s.active===0&&!s.enabled)
 await p.getByRole('button',{name:'音：切',exact:true}).click();await until(s=>s.context==='running'&&s.selected==='explore:miyabi'&&s.music===1)
 await p.getByTestId('audio-settings').click();await p.getByTestId('audio-arrangement').selectOption('kage');await until(s=>s.selected==='explore:kage');await p.getByRole('button',{name:'閉じる',exact:true}).click()
 await p.getByTestId('start').click();await until(s=>s.selected==='reflex:kage');await p.waitForTimeout(4500)
 await p.keyboard.press('j');await until(s=>s.history.some(x=>x.kind==='swing'))
 await p.getByTestId('audio-settings').click();await p.getByTestId('mute-bgm').check();let s=await until(s=>s.settings.bgmMute);const played=s.played
 await p.getByRole('button',{name:'閉じる',exact:true}).click();await p.waitForTimeout(800);await p.keyboard.press('j');await until(s=>s.played>played)
 await p.getByTestId('audio-settings').click();await p.getByTestId('mute-se').check();s=await until(s=>s.settings.seMute);const quiet=s.played;await p.getByRole('button',{name:'閉じる',exact:true}).click();await p.waitForTimeout(1000);await p.keyboard.press('j');await p.waitForTimeout(700);assert.equal((await stats()).played,quiet)
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await until(s=>s.hidden&&s.active===0)
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});await until(s=>!s.hidden&&s.music===1&&s.se===0)
 // The authoritative timeout is a fixture; the restart button and audio lifecycle are real.
 await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=structuredClone(r.state.get('w:oboro:game'));s.startedAt=r.clock().now()-900000;r.state.set('w:oboro:game',s)});await wait(p,()=>window.__ttvEngine.runtime.state.get('w:oboro:game').phase==='lost');await until(s=>s.selected==='defeat:kage');await p.getByTestId('start').click();await until(s=>s.selected==='reflex:kage'&&s.se===0)
 await p.getByRole('button',{name:'音：入',exact:true}).click();await until(s=>s.active===0&&!s.enabled)
 await p.reload();await p.getByTestId('start').waitFor();await until(s=>s.active===0&&!s.enabled);await p.evaluate(()=>{window.__ttvEngine.player.yaw=Math.PI});await p.waitForTimeout(500);await p.setViewportSize({width:320,height:780});await p.getByTestId('audio-settings').click();const bounds=await p.getByTestId('audio-panel').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=321&&bounds.y+bounds.height<=780,JSON.stringify(bounds));await p.getByRole('button',{name:'閉じる',exact:true}).click();assert.equal(await p.evaluate(()=>window.__micRequests),0);assert.deepEqual(errors,[])
 writeFileSync(`${out}/audio-integration-results.json`,JSON.stringify({autoplayPrevented:true,userGestureStarts:true,automaticSceneTracks:true,arrangement:true,seAndBgmIndependent:true,backgroundVisibilityFixture:true,realRestartAfterTimeoutFixture:true,reloadMuted:true,mobileAudioPanel320:true,microphoneRequests:0,errors},null,2));console.log('PASS game audio starts only after gesture; scene/arrangement, independent mute, background, restart and reload')
}finally{await browser.close()}
