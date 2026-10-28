import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve,extname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('../dist-pages/',import.meta.url)))
const base=process.env.OBORO_PAGES_BASE||'/tentenvworld_oboro-yashiki/'
const port=Number(process.env.PORT||5192)
const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.wav':'audio/wav'}
createServer((req,res)=>{
 let path;try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
 if(path===base.slice(0,-1)){res.writeHead(301,{Location:base}).end();return}
 if(!path.startsWith(base)||path.includes('..')||path.includes('\\')){res.writeHead(404).end();return}
 let file=path.slice(base.length);if(!file||file.endsWith('/'))file+='index.html'
 try{const data=readFileSync(resolve(root,file));res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404).end()}
}).listen(port,'127.0.0.1',()=>console.log(`http://localhost:${port}${base}`))
