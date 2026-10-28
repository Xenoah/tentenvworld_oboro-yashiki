// Local packaged preview: official client + the exact .ttvw archive. No accounts required.
import {createServer} from 'node:http'
import {readFileSync,existsSync} from 'node:fs'
import {resolve,extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {unzipSync} from 'fflate'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const client=resolve(root,'apps/client/dist'),archive=resolve(root,'releases/oboro-yashiki.ttvw')
if(!existsSync(resolve(client,'index.html'))||!existsSync(archive))throw Error('Run npm run build:all first.')
const files=unzipSync(readFileSync(archive)),mime={'.html':'text/html; charset=utf-8','.json':'application/json','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.wav':'audio/wav','.wasm':'application/wasm','.woff2':'font/woff2'}
const servers=[]
for(const [kind,port]of [['client',5190],['world',5180]]){
 const server=createServer((req,res)=>{
  let path
  try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')}catch{res.writeHead(400).end();return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
  if(path.split('/').includes('..')||path.includes('\\')){res.writeHead(400).end();return}
  let data
  if(kind==='world'){path=path||'world.json';data=files[path];res.setHeader('Access-Control-Allow-Origin','*')}
  else {path=path||'index.html';const full=resolve(client,path);if(!full.startsWith(client+'/')){res.writeHead(400).end();return}try{data=readFileSync(full)}catch{}}
  if(!data){res.writeHead(404).end('Not found');return}
  res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data)
 })
 server.listen(port,'127.0.0.1');servers.push(server)
}
console.log('朧の屋敷 / packaged preview\nhttp://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F\n同じブラウザで最大4タブ。別端末は公式親サーバーへ導入してください。')
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{for(const s of servers)s.close();process.exit()})
