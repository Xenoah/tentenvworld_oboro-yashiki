// Build the official client and validated world archive into one GitHub Pages tree.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const base=process.env.OBORO_PAGES_BASE||'/tentenvworld_oboro-yashiki/'
if(!/^\/[A-Za-z0-9_/-]*\/$/.test(base))throw Error('OBORO_PAGES_BASE must be an absolute URL path ending in /')
const run=(args,env={})=>execFileSync('npm',args,{cwd:root,stdio:'inherit',env:{...process.env,...env}})
run(['run','build']);run(['run','pack'])
run(['run','build:client'],{OBORO_BASE_PATH:`${base}play/`,VITE_OBORO_DEMO:'1'})
const out=join(root,'dist-pages');rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true})
cpSync(join(root,'apps/client/dist'),join(out,'play'),{recursive:true})
const files=unzipSync(readFileSync(join(root,'releases/oboro-yashiki.ttvw')))
for(const [name,data]of Object.entries(files)){if(name.includes('..')||name.startsWith('/'))throw Error('Unsafe archive path');const path=join(out,'world',name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data)}
cpSync(join(root,'web/index.html'),join(out,'index.html'))
cpSync(join(root,'evidence/11-architecture.png'),join(out,'courtyard.png'))
cpSync(join(root,'releases/oboro-yashiki.ttvw'),join(out,'oboro-yashiki.ttvw'))
cpSync(join(root,'LICENSE'),join(out,'LICENSE.txt'))
writeFileSync(join(out,'.nojekyll'),'')
// AGPL corresponding source accompanies the publicly served client even for a private repo.
execFileSync('git',['archive','--format=zip','--output='+join(out,'oboro-source.zip'),'HEAD'],{cwd:root})
writeFileSync(join(out,'build.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base,transport:'LocalTransport/BroadcastChannel',upstream:'97e9bc120f4f977e0a3cfdb79379391e236f25e2'},null,2))
console.log(`Pages artifact: ${out}\nBase path: ${base}`)
