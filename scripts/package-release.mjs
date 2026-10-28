import { execFileSync } from 'node:child_process'
import { cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync } from 'node:fs'
import { resolve,join,relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version
if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))throw Error('Invalid version')
const out=resolve(process.argv[2]||join(root,'releases-out'));mkdirSync(out,{recursive:true})
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()
const build=JSON.parse(readFileSync(join(root,'dist-pages/build.json'),'utf8'))
if(build.commit!==commit)throw Error('Run build:pages at the release commit first')
if(build.dirty!==false)throw Error('Release assets require a clean committed source build')
const evidence=resolve(process.env.OBORO_RELEASE_EVIDENCE_DIR||join(root,'evidence/pages'))
const screenshots=JSON.parse(readFileSync(join(evidence,'screenshots.json'),'utf8'))
if(screenshots.commit!==commit||screenshots.version!==version||screenshots.buildDirty!==false)throw Error('Screenshots must come from this exact clean release build')
const assets=[]
for(const [from,to]of [
 ['dist-pages/oboro-source.zip',`oboro-v${version}-source.zip`],
 ['releases/oboro-yashiki.ttvw',`oboro-yashiki-v${version}.ttvw`],
 ['dist-pages/LICENSE.txt','LICENSE.txt'],
 ['dist-pages/THIRD_PARTY_LICENSES.txt','THIRD_PARTY_LICENSES.txt'],
 ['docs/RELEASE_NOTES.md','RELEASE_NOTES.md'],
]){cpSync(join(root,from),join(out,to));assets.push(to)}
const releaseCaptures=[]
const selected=screenshots.captures.filter(c=>c.releaseScene)
const sceneFiles=selected.length?selected.map(c=>[c.file,c.releaseScene]):[['after-courtyard.png','courtyard'],['after-study.png','study'],['play-courtyard.png','play']]
if(sceneFiles.length!==3)throw Error('Exactly three release captures are required')
for(const [from,scene]of sceneFiles){
 if(!/^[a-z0-9-]+\.png$/.test(from)||!/^[a-z0-9-]+$/.test(scene))throw Error('Invalid capture asset name')
 const name=`oboro-v${version}-${scene}.png`;cpSync(join(evidence,from),join(out,name));assets.push(name)
 const capture=screenshots.captures.find(c=>c.file===from);if(!capture)throw Error(`Missing screenshot provenance: ${from}`)
 releaseCaptures.push({...capture,file:name,sourceCapture:from,sha256:createHash('sha256').update(readFileSync(join(out,name))).digest('hex')})
}
writeFileSync(join(out,'SCREENSHOTS.json'),JSON.stringify({...screenshots,captures:releaseCaptures},null,2)+'\n');assets.push('SCREENSHOTS.json')
const files={}
const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else files[relative(join(root,'dist-pages'),p)]=[readFileSync(p),{level:/\.(png|webp|zip|ttvw|vrm|woff2)$/i.test(e.name)?0:6}]}}
walk(join(root,'dist-pages'));const demo=`oboro-v${version}-pages.zip`;writeFileSync(join(out,demo),zipSync(files));assets.push(demo)
writeFileSync(join(out,'RELEASE_BUILD.json'),JSON.stringify({version,tag:`v${version}`,commit,upstream:build.upstream,transport:build.transport,vrHardwareTested:false,internetMultiplayerTested:false},null,2)+'\n');assets.push('RELEASE_BUILD.json')
const sums=assets.map(n=>`${createHash('sha256').update(readFileSync(join(out,n))).digest('hex')}  ${n}`).join('\n')+'\n'
writeFileSync(join(out,'SHA256SUMS'),sums)
console.log(JSON.stringify({version,commit,directory:out,assets:[...assets,'SHA256SUMS']},null,2))
