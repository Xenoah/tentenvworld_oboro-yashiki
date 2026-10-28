import {chromium} from 'playwright-core'
import {writeFileSync} from 'node:fs'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']})
const context=await browser.newContext({viewport:{width:1440,height:960}})
const page=await context.newPage();const logs=[]
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')logs.push(m.type()+': '+m.text())});page.on('pageerror',e=>logs.push('pageerror: '+e.stack))
await page.goto('http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F')
await page.waitForTimeout(14000)
await page.screenshot({path:'evidence/01-arrival.png'})
console.log((await page.locator('body').innerText()).slice(0,4500))
console.log(await page.evaluate(()=>{const e=window.__ttvEngine;return e?{p:e.localPose(),state:e.runtime.state.get('w:oboro:game'),interactables:e.interactables.size}:null}))
console.log(logs);writeFileSync('evidence/browser-log.json',JSON.stringify(logs,null,2))
await browser.close()
