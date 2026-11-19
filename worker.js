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
  return handleApi(request,{
   ...databaseAdapter(env.DB),
   config:env,
   secure:'; Secure',
   allowAuth:async()=> (await env.AUTH_LIMIT.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'})).success
  });
 }
};
