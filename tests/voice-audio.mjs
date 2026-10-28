import {chromium} from 'playwright-core'
import ts from 'typescript'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const out=process.env.OBORO_EVIDENCE_DIR||'evidence/pages';mkdirSync(out,{recursive:true})
const source=ts.transpileModule(readFileSync('apps/client/src/net/voiceAcoustics.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'')+'\nwindow.VoiceAcoustics=VoiceAcoustics;'
const browser=await chromium.launch({executablePath:process.env.BROWSER||undefined,headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<p>Offline receive-audio DSP verification. No microphone.</p>');await page.addScriptTag({content:source})
 const results=await page.evaluate(async()=>{
  const rms=(data,from,to,sr)=>{let sum=0;for(let i=Math.floor(from*sr);i<Math.floor(to*sr);i++)sum+=data[i]*data[i];return Math.sqrt(sum/((to-from)*sr))}
  const render=async(preset,hz,lightweight=false)=>{const ctx=new OfflineAudioContext(1,48000*1.5,48000),graph=new window.VoiceAcoustics(ctx);for(let i=1;i<graph.filters.length;i++)graph.filters[i-1].connect(graph.filters[i]);graph.mix.connect(ctx.destination);graph.set({preset,lightweight});const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=hz;gain.gain.value=.15;osc.connect(gain);gain.connect(graph.lowpass);osc.start(.25);osc.stop(.45);const audio=await ctx.startRendering(),d=audio.getChannelData(0);const result={signal:rms(d,.32,.42,48000),tail:rms(d,.48,.8,48000),late:rms(d,.85,1.1,48000),peak:Math.max(...d.map(Math.abs))};graph.dispose();return result}
  const outdoorHigh=await render('outdoor',4000),waterHigh=await render('underwater',4000),outdoorLow=await render('outdoor',200),waterLow=await render('underwater',200),room=await render('room',800),narrow=await render('narrow',800),lite=await render('room',800,true)
  return {outdoorHigh,waterHigh,outdoorLow,waterLow,room,narrow,lite,microphoneRequested:false,execution:'Browser OfflineAudioContext renders generated tones through the same receive DSP class; not microphone speech or remote conversation'}
 })
 assert.ok(results.waterHigh.signal/results.outdoorHigh.signal<.12,'underwater must attenuate 4kHz speech band')
 assert.ok(results.waterLow.signal/results.outdoorLow.signal>.5,'low voice fundamentals must remain audible')
 assert.ok(results.room.tail>1e-4&&results.narrow.tail>1e-4,'actual delayed acoustic tails')
 assert.ok(results.room.late>results.narrow.late*2,'larger room has longer decay')
 assert.ok(results.lite.late<1e-7,'lightweight path removes convolution tail')
 for(const r of Object.values(results))if(r&&typeof r==='object'&&'peak'in r)assert.ok(r.peak<.3,'bounded gain avoids amplification spikes')
 assert.deepEqual(errors,[]);writeFileSync(`${out}/voice-audio-results.json`,JSON.stringify({results,errors},null,2));console.log('PASS real browser audio renders',JSON.stringify(results))
}finally{await browser.close()}
