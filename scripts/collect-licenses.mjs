import { readdirSync,readFileSync,existsSync,writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const packages=[]
for(const entry of readdirSync(join(root,'node_modules'),{withFileTypes:true})){
 if(entry.name.startsWith('.'))continue
 if(entry.name.startsWith('@'))for(const n of readdirSync(join(root,'node_modules',entry.name)))packages.push(join(root,'node_modules',entry.name,n))
 else if(entry.isDirectory())packages.push(join(root,'node_modules',entry.name))
}
let text='OBORO / TenTenV — third-party notices\n\nProject: AGPL-3.0-only; see LICENSE.txt and corresponding source.\nAkane avatar: minto_akayama / CC0, inherited from TenTenV.\nLINE Seed JP Bold: LY Corporation / SIL OFL 1.1.\n\n'
text+=readFileSync(join(root,'apps/client/public/fonts/OFL.txt'),'utf8')+'\n'
for(const dir of packages.sort()){
 const p=join(dir,'package.json');if(!existsSync(p))continue
 const meta=JSON.parse(readFileSync(p,'utf8'))
 const licenses=readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&/^(licen[cs]e|copying|notice)(\.|$)/i.test(e.name))
 if(!licenses.length)continue
 text+=`\n\n===== ${meta.name} ${meta.version} (${typeof meta.license==='string'?meta.license:'see text'}) =====\n`
 for(const l of licenses)text+=`\n--- ${l.name} ---\n`+readFileSync(join(dir,l.name),'utf8')+'\n'
}
writeFileSync(process.argv[2]||join(root,'dist-pages/THIRD_PARTY_LICENSES.txt'),text)
