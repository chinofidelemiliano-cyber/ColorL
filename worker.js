import { handleApi } from './api.js';

function databaseAdapter(database){
 const prepare = (sql,params) => params.length ? database.prepare(sql).bind(...params) : database.prepare(sql);
 const metadata = ({meta}) => ({changes:meta.changes,lastInsertRowid:meta.last_row_id});
 return {
  query: sql => ({
   get: (...args) => prepare(sql,args).first(),
   all: async (...args) => (await prepare(sql,args).all()).results,
   run: async (...args) => metadata(await prepare(sql,args).run())
  }),
  batch: async statements => (await database.batch(statements.map(([sql,args])=>prepare(sql,args)))).map(metadata)
 };
}

export default {
 async fetch(request,env){
  if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if(!env.DB)return Response.json({error:'Falta configurar la base de datos D1 de ColorL con el enlace DB.'},{status:503,headers:{'Cache-Control':'no-store'}});
  const database=databaseAdapter(env.DB);
  return handleApi(request,{
   ...database,
   config:env,
   secure:'; Secure',
   allowAuth:async()=>{
    const address=request.headers.get('CF-Connecting-IP')||'unknown';
    if(env.AUTH_LIMIT?.limit){
     try{return (await env.AUTH_LIMIT.limit({key:address})).success;}
     catch{console.warn('El limitador de Cloudflare no respondió. Se usará el de D1.');}
    }
    const minute=Math.floor(Date.now()/60000);
    const result=await database.query(`
     INSERT INTO auth_attempts(address,minute,count) VALUES(?,?,1)
     ON CONFLICT(address) DO UPDATE SET count=CASE WHEN minute=excluded.minute THEN count+1 ELSE 1 END,minute=excluded.minute
     RETURNING count
    `).get(address,minute);
    if(crypto.getRandomValues(new Uint8Array(1))[0]<4)await database.query('DELETE FROM auth_attempts WHERE minute<?').run(minute-60);
    return result.count<=25;
   }
  });
 }
};
