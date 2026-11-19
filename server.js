import http from 'node:http';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { handleApi } from './api.js';

const directory = process.env.DATA_DIR || 'data';
await mkdir(directory, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(directory + '/colorl.sqlite');
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
const migrations = new URL('./migrations/',import.meta.url);
for(const file of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) db.exec(await readFile(new URL(file,migrations),'utf8'));
const query = sql => db.prepare(sql);
function batch(statements){
 db.exec('BEGIN');
 try {
  const results = statements.map(([sql,params])=>query(sql).run(...params));
  db.exec('COMMIT');
  return results;
 } catch (error) {
  db.exec('ROLLBACK');
  throw error;
 }
}
function verifyLegacy(password, stored){
 const [salt, expected]=stored.split(':');
 if(!/^[a-f0-9]{128}$/.test(expected))return false;
 return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));
}
const rates = new Map();
function allowAuth(ip){
 const stamp=Date.now();
 for(const [key,value] of rates)if(value.until<stamp)rates.delete(key);
 const rate=rates.get(ip)||{count:0,until:stamp+60000};
 rates.set(ip,rate);
 return ++rate.count<=25;
}
const files = {'/':'index.html','/styles.css':'styles.css','/app.js':'app.js','/lab.js':'lab.js','/lab-model.js':'lab-model.js','/inventory-import.js':'inventory-import.js','/inventory.js':'inventory.js','/print-calculations.js':'print-calculations.js','/color-standards.js':'color-standards.js','/spectral-model.js':'spectral-model.js','/color-tools.js':'color-tools.js','/quality.js':'quality.js','/quality-model.js':'quality-model.js','/catalog-import.js':'catalog-import.js','/delimited.js':'delimited.js','/hero.webp':'hero.webp','/hero.png':'hero.png'};
const mime = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',wasm:'application/wasm',webp:'image/webp',png:'image/png'};


http.createServer(async (request,response)=>{
 const url = new URL(request.url,'http://localhost');
 try {
  if(url.pathname.startsWith('/api/')){
   const hasBody = !['GET','HEAD'].includes(request.method);
   const req = new Request(url,{method:request.method,headers:request.headers,...(hasBody?{body:Readable.toWeb(request),duplex:'half'}:{})});
   const result = await handleApi(req,{query,batch,config:process.env,secure:process.env.SECURE_COOKIE==='1'?'; Secure':'',allowAuth:()=>allowAuth(request.socket.remoteAddress),verifyLegacy});
   response.writeHead(result.status,Object.fromEntries(result.headers));
   return response.end(Buffer.from(await result.arrayBuffer()));
  }
  const vendor = /^\/vendor\/(?:[\w-]+\/)?[\w.-]+$/.test(url.pathname) && !url.pathname.includes('..');
  const file = vendor ? url.pathname.slice(1) : Object.hasOwn(files,url.pathname) && files[url.pathname];
  if(!file || request.method!=='GET'){response.writeHead(404);return response.end();}
  const content = await readFile(new URL('./public/'+file,import.meta.url));
  response.writeHead(200,{'Content-Type':mime[file.split('.').pop()] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
  response.end(content);
 } catch(error) {
  response.writeHead(error.code==='ENOENT'?404:500);
  response.end();
 }
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('ColorL escuchando en el puerto '+(process.env.PORT||3000)));
