import { spawn } from 'node:child_process'
const grouped=process.platform!=='win32'
const children=['dev:client','dev:world'].map(script=>spawn('npm',['run',script],{stdio:'inherit',detached:grouped}))
let stopping=false
const stop=(code=0)=>{
 if(stopping)return;stopping=true
 for(const p of children)try{if(grouped)process.kill(-p.pid,'SIGTERM');else p.kill('SIGTERM')}catch{}
 process.exit(code)
}
for(const p of children)p.on('exit',code=>{if(!stopping)stop(code||0)})
console.log('\n朧の屋敷: http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F\n同じブラウザでこのURLを4タブまで開くと共同探索できます。\n')
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop())
