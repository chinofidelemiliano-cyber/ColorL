import {standardValue,standardKey} from './public/color-standards.js';
import {validateSeries} from './public/spectral-model.js';
import {inventoryRows} from './inventory-api.js';
const hex = bytes => Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('');
const encoder = new TextEncoder();
const hash = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const preferredIterations = 600000;
const compatibleIterations = 100000;
async function passwordDigest(password,salt,iterations){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations},key,256));
}
function iterationLimit(error){
 return error?.name==='NotSupportedError'&&/iteration counts above/i.test(error.message);
}
async function passwordHash(password,salt){
 try{return 'pbkdf2:'+salt+':'+await passwordDigest(password,salt,preferredIterations);}
 catch(error){
  if(!iterationLimit(error))throw error;
  return 'pbkdf2-100k:'+salt+':'+await passwordDigest(password,salt,compatibleIterations);
 }
}
async function verifyPassword(password,stored,verifyLegacy){
 if(!stored){await passwordHash(password,'dummy');return false;}
 const [version,salt,expected]=stored.split(':');
 const iterations=version==='pbkdf2'?preferredIterations:version==='pbkdf2-100k'?compatibleIterations:null;
 if(!iterations)return verifyLegacy?.(password,stored) || false;
 if(!salt||!expected||! /^[0-9a-f]{64}$/.test(expected))return false;
 const actual=await passwordDigest(password,salt,iterations);
 let difference=0;
 for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
const now = () => new Date().toISOString();
const profile = ({id,name,email,role,theme,invited}) => ({id,name,email,role,theme,fullAccess:role==='administrador'||Boolean(invited)});
const userColumns = 'users.*, EXISTS(SELECT 1 FROM access_invitations WHERE used_by=users.id) AS invited';
const codeInput = value => typeof value==='string' ? value.trim() : '';
const invitationKey = input => /^[a-f0-9]{32}$/i.test(input) ? hash(input.toLowerCase()) : null;
function isOwnerBootstrap(config,email,code){
 return Boolean(config.ADMIN_INVITE && config.ADMIN_EMAIL?.trim().toLowerCase()===email && code===config.ADMIN_INVITE.trim());
}
const shareScopes = ['Todo el equipo','Laboratorio y supervisión','Solo supervisión'];
const inkCode = code => String(code??'').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const inkTechnology = technology => ['Base agua','UV','Base solvente'].includes(technology);
const kinds = new Set(['colores','formulas','mediciones','correcciones','inventario','anilox','academia','componentes','tintas','caracterizaciones','catalogos','curvas','calidad-estudios','calidad-acciones']);

async function body(req,limit=200000) {
 let data = '';
 const decoder = new TextDecoder();
 for await (const chunk of req.body || []) {
  data += decoder.decode(chunk,{stream:true});
  if (data.length > limit) throw new Error('Solicitud demasiado grande');
 }
 data += decoder.decode();
 const parsed = JSON.parse(data || '{}');
 if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Solicitud inválida');
 return parsed;
}


export async function handleApi(req,{query,batch,config,secure,allowAuth,verifyLegacy}) {
 const url = new URL(req.url), path = url.pathname, method = req.method;
 const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
 const json = (status,data) => new Response(JSON.stringify(data),{status,headers});
 const fail = (status,error) => json(status,{error});
 let phase='session';
 try {
  if (method !== 'GET' && req.headers.get('sec-fetch-site') === 'cross-site') return fail(403,'Origen no permitido');
  const token = req.headers.get('cookie')?.match(/(?:^|;\s*)colorl=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session = token && await query('SELECT '+userColumns+' FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(await hash(token),Date.now());
  if (path === '/api/me' && method === 'GET') return json(200,{user:session ? profile(session) : null});
  if (['/api/login','/api/register','/api/recover','/api/reset'].includes(path) && method === 'POST') {
   const stamp = Date.now();
   phase='rate-limit';
   if (!await allowAuth()) return fail(429,'Inténtalo de nuevo en un minuto');
   const input = await body(req);
   const {password='',key=''} = input;
   const name = String(input.name || '').trim().slice(0,80);
   const email = String(input.email || '').trim().toLowerCase();
   const validPassword = typeof password === 'string' && password.length >= 10 && password.length <= 200;
   if (path === '/api/recover') {
    if (!config.RECOVERY_WEBHOOK) return fail(503,'La recuperación por correo requiere configurar el servicio de correo.');
    const user = await query('SELECT id FROM users WHERE email=?').get(email);
    if (user) {
     const reset = random();
     await batch([
      ['DELETE FROM resets WHERE user_id=?',[user.id]],
      ['INSERT INTO resets VALUES(?,?,?)',[await hash(reset),user.id,stamp+1800000]]
     ]);
     const response = await fetch(config.RECOVERY_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',...(config.RECOVERY_SECRET ? {Authorization:'Bearer '+config.RECOVERY_SECRET} : {})},body:JSON.stringify({email,token:reset}),signal:AbortSignal.timeout(5000)});
     if (!response.ok) throw new Error('Servicio de correo no disponible');
    }
    return json(200,{message:'Si la cuenta existe, recibirás un código por correo.'});
   }
   if (path === '/api/reset') {
    if (!validPassword || typeof key !== 'string') return fail(400,'Usa un código válido y una contraseña de 10 a 200 caracteres');
    const reset = await query('SELECT * FROM resets WHERE token=? AND expires>?').get(await hash(key.trim()),stamp);
    if (!reset) return fail(400,'Código inválido o vencido');
    const salt = random();
    const replacement = await passwordHash(password,salt);
    const keyHash = await hash(key.trim());
    const results = await batch([
     ['UPDATE users SET password=? WHERE id=? AND EXISTS(SELECT 1 FROM resets WHERE token=? AND expires>?)',[replacement,reset.user_id,keyHash,stamp]],
     ['DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM resets WHERE token=? AND expires>?)',[reset.user_id,keyHash,stamp]],
     ['DELETE FROM resets WHERE token=?',[keyHash]]
    ]);
    if (!results[0].changes) return fail(400,'Código inválido o vencido');
    return json(200,{message:'Contraseña actualizada'});
   }
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !validPassword) return fail(400,'Escribe un correo válido y una contraseña de 10 a 200 caracteres');
   phase='user-lookup';
   let user = await query('SELECT '+userColumns+' FROM users WHERE email=?').get(email);
   if (path === '/api/register') {
    if (!name) return fail(400,'Escribe tu nombre');
    if (user) return fail(409,'Este correo ya está registrado');
    const code=codeInput(input.invite), administrator=isOwnerBootstrap(config,email,code);
    if(config.ADMIN_INVITE&&config.ADMIN_EMAIL?.trim().toLowerCase()===email&&!administrator)
     return fail(400,'Para registrar el correo administrador, usa el código privado configurado en Cloudflare.');
    const key=administrator||!code ? null : await invitationKey(code);
    if(code&&!administrator&&(!key||!await query('SELECT 1 AS valid FROM access_invitations WHERE code_hash=? AND expires_at>? AND used_by IS NULL').get(key,stamp)))return fail(400,'El código de acceso es inválido, venció o ya se utilizó. Puedes dejarlo vacío para crear una cuenta de comparación.');
    phase='password-derivation';
    const credential=await passwordHash(password,random()), fresh=random(), expiration=stamp+604800000;
    const params=[email,name,credential,administrator?'administrador':'laboratorista'];
    const registration=key
     ? ['INSERT INTO users(email,name,password,role) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM access_invitations WHERE code_hash=? AND expires_at>? AND used_by IS NULL) ON CONFLICT(email) DO NOTHING',[...params,key,Date.now()]]
     : ['INSERT INTO users(email,name,password,role) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING',params];
    const statements=[['DELETE FROM sessions WHERE expires<=?',[stamp]],registration];
    if(key)statements.push(['UPDATE access_invitations SET used_by=(SELECT id FROM users WHERE email=?), used_at=? WHERE code_hash=? AND changes()=1',[email,stamp,key]]);
    statements.push(['INSERT INTO sessions(token,user_id,expires) SELECT ?,id,? FROM users WHERE email=? AND changes()=1',[await hash(fresh),expiration,email]]);
    phase='registration-write';
    const results=await batch(statements), saved=results[1];
    phase='registration-read';
    user=await query('SELECT '+userColumns+' FROM users WHERE email=?').get(email);
    if(!saved.changes)return user?fail(409,'Este correo ya está registrado. Inicia sesión para continuar.'):fail(400,'El código de acceso venció o ya se utilizó.');
    if(!user||!results.at(-1).changes)return fail(503,'La cuenta se creó. Intenta iniciar sesión con tu correo y contraseña.');
    headers.set('Set-Cookie','colorl='+fresh+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+secure);
    return json(200,{user:profile(user)});
   } else {
    phase='password-verification';
    const matches = await verifyPassword(password,user?.password,verifyLegacy);
    if (!user || !matches) return fail(401,'Correo o contraseña incorrectos');
   }
   const fresh = random();
   await query('DELETE FROM sessions WHERE expires<=?').run(stamp);
   await query('INSERT INTO sessions VALUES(?,?,?)').run(await hash(fresh),user.id,stamp+604800000);
   headers.set('Set-Cookie','colorl='+fresh+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+secure);
   return json(200,{user:profile(user)});
  }
  if (!session) return fail(401,'Inicia sesión para continuar');
  const owner = session.id;
  const account=profile(session);
  if(path==='/api/invitations' && method==='POST'){
   if(session.role!=='administrador')return fail(403,'Solo un administrador puede generar invitaciones.');
   const code=random().slice(0,32), expires=Date.now()+7*86400000;
   await query('INSERT INTO access_invitations(code_hash,created_by,expires_at) VALUES(?,?,?)').run(await invitationKey(code),owner,expires);
   return json(201,{code,expires});
  }
  if(path==='/api/access' && method==='POST'){
   if(!await allowAuth())return fail(429,'Inténtalo de nuevo en un minuto');
   const {code:input}=await body(req), code=codeInput(input);
   if(isOwnerBootstrap(config,session.email,code)){
    await query("UPDATE users SET role='administrador' WHERE id=?").run(owner);
   }else{
    if(account.fullAccess)return fail(409,'Tu cuenta ya tiene acceso al laboratorio. Si buscas activar el rol administrador, verifica el código privado.');
    const key=await invitationKey(code);
    const stamp=Date.now();
    if(!key)return fail(400,'Ingresa un código de acceso válido.');
    const outcome=await query('UPDATE access_invitations SET used_by=?,used_at=? WHERE code_hash=? AND expires_at>? AND used_by IS NULL AND NOT EXISTS(SELECT 1 FROM access_invitations WHERE used_by=?)').run(owner,stamp,key,stamp,owner);
    if(!outcome.changes)return fail(400,'El código de acceso venció, ya se utilizó o tu cuenta ya tiene acceso.');
   }
   return json(200,{user:profile(await query('SELECT '+userColumns+' FROM users WHERE id=?').get(owner))});
  }
  if(!account.fullAccess && !['/api/profile','/api/logout'].includes(path))return fail(403,'Tu cuenta tiene acceso a Comparar colores. Activa una invitación para desbloquear el laboratorio.');
  if (path === '/api/logout' && method === 'POST') {
   await query('DELETE FROM sessions WHERE token=?').run(await hash(token));
   headers.set('Set-Cookie','colorl=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+secure);
   return json(200,{ok:true});
  }
  if (path === '/api/profile' && method === 'POST') {
   const {name,theme} = await body(req);
   if (typeof name !== 'string' || !name.trim() || !['light','dark'].includes(theme)) return fail(400,'Perfil inválido');
   await query('UPDATE users SET name=?,theme=? WHERE id=?').run(name.trim().slice(0,80),theme,owner);
   return json(200,{user:profile(await query('SELECT '+userColumns+' FROM users WHERE id=?').get(owner))});
  }
  if (path === '/api/users' && session.role === 'administrador') {
   if (method === 'GET') return json(200,(await query('SELECT '+userColumns+' FROM users ORDER BY name').all()).map(profile));
   const {id,role} = await body(req);
   if (method !== 'POST' || !Number.isInteger(id) || id===owner || !['administrador','supervisor','laboratorista','operador','estudiante'].includes(role)) return fail(400,'Asignación inválida');
   await query('UPDATE users SET role=? WHERE id=?').run(role,id);
   return json(200,{ok:true});
  }
  if (path === '/api/draft') {
   if (['operador','estudiante'].includes(session.role)) return fail(403,'Permiso insuficiente');
   const input = method === 'POST' ? await body(req) : {kind:url.searchParams.get('kind')};
   if (!['formulas','colores','inventario','anilox','componentes'].includes(input.kind)) return fail(400,'Tipo de borrador inválido');
   if (method === 'GET') {
    const draft = await query('SELECT content FROM drafts WHERE owner=? AND kind=?').get(owner,input.kind);
    return json(200,{content:draft ? JSON.parse(draft.content) : null});
   }
   if (method === 'POST' && input.content && typeof input.content === 'object' && !Array.isArray(input.content)) {
    await query('INSERT INTO drafts VALUES(?,?,?) ON CONFLICT(owner,kind) DO UPDATE SET content=excluded.content').run(owner,input.kind,JSON.stringify(input.content));
    return json(200,{ok:true});
   }
   return fail(400,'Borrador inválido');
  }
  if (path === '/api/catalog-source' && method === 'GET') {
   const item = await query('SELECT filename,data FROM catalog_sources WHERE id=? AND owner=?').get(url.searchParams.get('id'),owner);
   if(!item)return fail(404,'Archivo no disponible');
   const bytes=Uint8Array.from(atob(item.data),character=>character.charCodeAt(0));
   return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/inventory-import' && method==='POST'){
   if(['operador','estudiante'].includes(session.role))return fail(403,'Permiso insuficiente');
   const {kind,filename,data,items,addToCatalog}=await body(req,1550000);
   const rows=inventoryRows(kind,items);
   if(!rows||typeof filename!=='string'||filename.length>180||!/\.pdf$/i.test(filename)||typeof data!=='string'||data.length>1333336||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4||!atob(data).startsWith('%PDF-')||atob(data).length>1000000)
    return fail(400,'Revisa el PDF, los campos obligatorios y los posibles duplicados.');
   const source=crypto.randomUUID(), updated=now(), status='Registrada';
   const document=JSON.stringify({source,importKind:kind,count:rows.length});
   const statements=[
    ['INSERT INTO catalog_sources VALUES(?,?,?,?)',[source,owner,filename,data]],
    [`INSERT INTO records(owner,kind,title,value,status,updated)
      SELECT ?,?,json_extract(entry.value,'$.title'),json_set(json_extract(entry.value,'$.value'),'$.source',?),?,?
      FROM json_each(?) AS entry
      WHERE NOT EXISTS (SELECT 1 FROM records r WHERE r.owner=? AND r.kind=?
       AND lower(trim(json_extract(r.value,'$.code')))=lower(trim(json_extract(entry.value,'$.value.code')))
       AND (?!='inventario' OR lower(trim(json_extract(r.value,'$.lot')))=lower(trim(json_extract(entry.value,'$.value.lot')))))`,
     [owner,kind,source,status,updated,JSON.stringify(rows),owner,kind,kind]],
   ];
   const products=new Map();
   if(kind==='inventario'&&addToCatalog===true){
    for(const {title,value} of rows){
     const codeKey=inkCode(value.code);
     if(!inkTechnology(value.technology))continue;
     const existing=products.get(codeKey);
     if(existing&&existing.value.technology!==value.technology){
      products.set(codeKey,{value:{technology:null}});
      continue;
     }
     if(!existing)products.set(codeKey,{title,value:{code:value.code,codeKey,technology:value.technology,supplier:value.supplier,available:true,requiresVerifiedLots:true,source}});
    }
   }
   const catalog=[...products.values()].filter(product=>product.value.technology);
   if(catalog.length)statements.push([`
    INSERT INTO records(owner,kind,title,value,status,updated)
    SELECT ?,'tintas',json_extract(entry.value,'$.title'),json_extract(entry.value,'$.value'),?,?
    FROM json_each(?) AS entry WHERE NOT EXISTS(
     SELECT 1 FROM records WHERE owner=? AND kind='tintas' AND status<>'Archivada'
      AND json_extract(value,'$.codeKey')=json_extract(entry.value,'$.value.codeKey'))`,[owner,status,updated,JSON.stringify(catalog),owner]]);
   statements.push(
    [`INSERT INTO history(actor,record_id,snapshot,created)
      SELECT ?,id,json_object('kind',kind,'title',title,'value',json(value),'status',status),?
      FROM records WHERE owner=? AND kind IN (?,'tintas') AND json_extract(value,'$.source')=?`,[owner,updated,owner,kind,source]],
    [`INSERT INTO records(owner,kind,title,value,status,updated)
      SELECT ?,'catalogos',?,json_set(?,'$.count',COUNT(*)),?,? FROM records
      WHERE owner=? AND kind=? AND json_extract(value,'$.source')=?`,[owner,filename,document,status,updated,owner,kind,source]]
   );
   const results=await batch(statements);
   return json(200,{count:results[1].changes,skipped:rows.length-results[1].changes,catalogCount:catalog.length?results[2].changes:0});
  }
  if(path==='/api/stock-movement' && method==='POST'){
   if(['operador','estudiante'].includes(session.role))return fail(403,'Permiso insuficiente');
   const {id,amount,reason}=await body(req);
   if(!Number.isSafeInteger(id)||typeof amount!=='number'||!Number.isFinite(amount)||amount===0||Math.abs(amount)>1e7||typeof reason!=='string'||!reason.trim())
    return fail(400,'Indica un lote, una cantidad y el motivo del movimiento.');
   const changed=now(), movement=crypto.randomUUID();
   const [write]=await batch([
    [`UPDATE records SET value=json_set(value,'$.quantity',round(CAST(json_extract(value,'$.quantity') AS REAL)+?,6),
     '$.lastMovement',?),updated=? WHERE id=? AND owner=? AND kind='inventario' AND status<>'Archivada'
     AND json_extract(value,'$.quantity') IS NOT NULL AND json_extract(value,'$.quantity')!='' AND round(CAST(json_extract(value,'$.quantity') AS REAL)+?,6)>=0`,
     [amount,movement,changed,id,owner,amount]],
    [`INSERT INTO history(actor,record_id,snapshot,created)
      SELECT ?,id,json_object('kind',kind,'title',title,'value',json(value),'status',status,
       'movement',json_object('amount',?,'reason',?)),? FROM records
      WHERE owner=? AND id=? AND json_extract(value,'$.lastMovement')=?`,[owner,amount,reason.trim().slice(0,500),changed,owner,id,movement]]
   ]);
   if(!write.changes)return fail(409,'El lote no está disponible o la salida supera la existencia.');
   return json(200,{ok:true});
  }
  if(path==='/api/stock-movement' && method==='GET'){
   const id=Number(url.searchParams.get('id'));
   if(!Number.isSafeInteger(id)||id<=0)return fail(400,'Selecciona un lote.');
   return json(200,await query(`SELECT history.created,
    json_extract(history.snapshot,'$.movement.amount') AS amount,
    json_extract(history.snapshot,'$.movement.reason') AS reason,
    json_extract(history.snapshot,'$.value.quantity') AS quantity
    FROM history JOIN records ON records.id=history.record_id
    WHERE records.owner=? AND records.kind='inventario' AND records.id=?
    AND json_type(history.snapshot,'$.movement')='object' ORDER BY history.id DESC LIMIT 100`).all(owner,id));
  }
  if (path === '/api/catalog-import' && method === 'POST') {
   if (['operador','estudiante'].includes(session.role)) return fail(403,'Permiso insuficiente');
   const {filename,data,items,text}=await body(req,1550000);
   if(typeof filename!=='string'||!filename.trim()||filename.length>180||typeof data!=='string'||data.length>1333336||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4||atob(data).length>1000000||
    !Array.isArray(items)||items.length>20||typeof text!=='string'||text.length>12000||
    items.some(item=>!item||typeof item!=='object'||typeof item.name!=='string'||!item.name.trim()||
     typeof item.code!=='string'||!item.code.trim()||!inkTechnology(item.technology)))return fail(400,'Revisa el archivo y confirma los datos esenciales de cada tinta.');
   const id=crypto.randomUUID(), updated=now();
   const fields=['code','technology','pigment','color','colorName','resin','compatibility','strength','family','manufacturer'];
   const entries=[['catalogos',filename,{source:id,text,count:items.length}],...items.map(item=>['tintas',item.name,Object.fromEntries([...fields.map(key=>[key,String(item[key]??'').trim().slice(0,240)]),['source',id],['available',item.available===true],['codeKey',inkCode(item.code.slice(0,240))]])])];
   const statements=[['INSERT INTO catalog_sources VALUES(?,?,?,?)',[id,owner,filename,data]]];
   for(const [kind,title,value] of entries){
    const status='Registrada',name=title.trim().slice(0,100);
    statements.push(
     ['INSERT INTO records(owner,kind,title,value,status,updated) VALUES(?,?,?,?,?,?)',[owner,kind,name,JSON.stringify(value),status,updated]],
     ['INSERT INTO history(actor,record_id,snapshot,created) VALUES(?,last_insert_rowid(),?,?)',[owner,JSON.stringify({kind,title:name,value,status}),updated]]
    );
   }
   await batch(statements);
   return json(200,{count:items.length});
  }
  if(path==='/api/color-standards' && method==='POST'){
   if(['operador','estudiante'].includes(session.role))return fail(403,'Permiso insuficiente');
   const {items}=await body(req,700000);
   if(!Array.isArray(items)||!items.length||items.length>100)return fail(400,'Importa entre 1 y 100 patrones.');
   const source=crypto.randomUUID(), updated=now(), seen=new Set();
   const rows=[];
   for(const item of items){
    try{
     if(typeof item?.title!=='string'||!item.title.trim())throw new Error('Falta el nombre del patrón.');
     const value=standardValue(item.value||{}), key=standardKey(value);
     if(seen.has(key))throw new Error('El archivo contiene patrones duplicados.');
     seen.add(key);
     rows.push({title:item.title.trim().slice(0,100),value:{...value,standardKey:key,standardImport:source}});
    }catch(error){return fail(400,error.message);}
   }
   const [saved]=await batch([
    [`INSERT INTO records(owner,kind,title,value,status,updated)
      SELECT ?,'colores',json_extract(entry.value,'$.title'),json_extract(entry.value,'$.value'),'Registrada',?
      FROM json_each(?) AS entry WHERE NOT EXISTS(
       SELECT 1 FROM records WHERE owner=? AND kind='colores' AND status<>'Archivada'
       AND json_extract(value,'$.standardKey')=json_extract(entry.value,'$.value.standardKey'))`,[owner,updated,JSON.stringify(rows),owner]],
    [`INSERT INTO history(actor,record_id,snapshot,created)
      SELECT ?,id,json_object('kind',kind,'title',title,'value',json(value),'status',status),?
      FROM records WHERE owner=? AND kind='colores' AND json_extract(value,'$.standardImport')=?`,[owner,updated,owner,source]]
   ]);
   return json(200,{count:saved.changes,skipped:rows.length-saved.changes});
  }
  if (path === '/api/records' && method === 'GET') {
   const review = ['administrador','supervisor'].includes(session.role);
   const records = await query(`
    SELECT * FROM records
    WHERE owner=? OR (kind='formulas' AND (
     (? AND status IN ('En revisión','Aprobada','Compartida'))
     OR (status='Compartida' AND (
      COALESCE(json_extract(value,'$.shareScope'),'Todo el equipo')='Todo el equipo'
      OR (? AND json_extract(value,'$.shareScope')='Laboratorio y supervisión')
     ))
    ))
    ORDER BY updated DESC,id DESC
   `).all(owner,Number(review),Number(session.role==='laboratorista'));
   return json(200,records.map(r=>({...r,value:JSON.parse(r.value)})));
  }
  if (path === '/api/export' && method === 'GET') return json(200,{
   records:(await query('SELECT * FROM records WHERE owner=?').all(owner)).map(r=>({...r,value:JSON.parse(r.value)})),
   history:(await query('SELECT history.* FROM history JOIN records ON records.id=history.record_id WHERE records.owner=? ORDER BY history.id').all(owner)).map(r=>({...r,snapshot:JSON.parse(r.snapshot)}))
  });
  if (path === '/api/records' && method === 'POST') {
   const {id,kind,title,value={},status='Borrador'} = await body(req);
   if (!kinds.has(kind) || typeof title !== 'string' || !title.trim() || !value || typeof value !== 'object' || !['Borrador','En revisión','Aprobada','Compartida','Registrada','Completada','Archivada'].includes(status)) return fail(400,'Registro inválido');
   const existing = id == null ? null : await query('SELECT * FROM records WHERE id=?').get(id);
   const review = ['administrador','supervisor'].includes(session.role);
   const reviewing = existing?.kind==='formulas' && kind==='formulas' && review && ['En revisión','Aprobada','Compartida'].includes(existing.status) && ['Aprobada','Compartida'].includes(status);
   if ((id != null && (!existing || existing.kind!==kind || (existing.owner!==owner && !reviewing))) || (session.role==='estudiante' && kind!=='academia') || (session.role==='operador' && kind!=='mediciones') || (kind==='formulas' && ['Aprobada','Compartida'].includes(status) && !reviewing)) return fail(403,'Permiso insuficiente');
   if(kind==='inventario'&&existing){
    const current=JSON.parse(existing.value);
    if(current.quantity!=null&&current.quantity!==''){
     value.quantity=current.quantity;
     if(current.lastMovement)value.lastMovement=current.lastMovement;
    }
   }
   if(kind==='inventario'&&value.stockVerified===true){
    const date=String(value.expiry??'');
    if(!String(value.code??'').trim()||!String(value.lot??'').trim()||!inkTechnology(value.technology)||
      value.quantity==null||value.quantity===''||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
     return fail(400,'Completa código, lote, tecnología, existencia y caducidad válida antes de verificar.');
   }
   if(kind==='inventario'&&value.quantity!==''&&value.quantity!=null&&(!Number.isFinite(Number(value.quantity))||Number(value.quantity)<0))
    return fail(400,'La existencia del lote debe ser mayor o igual a cero.');
   if(kind==='tintas'&&(typeof value.code!=='string'||!value.code.trim()||value.code.length>240||!inkTechnology(value.technology)))return fail(400,'Escribe un código de tinta y una tecnología válidos.');
   if(kind==='tintas')value.codeKey=inkCode(value.code);
   if(kind==='curvas'){
    try{validateSeries(value.series);}
    catch(error){return fail(400,error.message);}
    if(value.confirmed!==true||!Number.isSafeInteger(value.inkId)||!Number.isSafeInteger(value.baseId)||value.inkId===value.baseId||
       !inkTechnology(value.context?.technology)||!String(value.context?.substrate||'').trim()||!String(value.context?.anilox||'').trim()||
       !Number.isFinite(value.context?.bcm)||value.context.bcm<=0||!String(value.context?.geometry||'').trim())
     return fail(400,'Completa los componentes, las condiciones y la verificación óptica.');
   }
   if(kind==='colores'){
    if(String(value.collection??'').trim()){
     try{
      const standard=standardValue(value);
      Object.assign(value,standard,{favorite:value.favorite===true,standardKey:standardKey(standard)});
     }catch(error){return fail(400,error.message);}
     const duplicate=await query("SELECT id FROM records WHERE owner=? AND kind='colores' AND status<>'Archivada' AND json_extract(value,'$.standardKey')=? AND id<>?").get(owner,value.standardKey,existing?.id??0);
     if(duplicate)return fail(409,'Ya hay un patrón con este código, colección y condiciones.');
    }else delete value.standardKey;
   }
   if(kind==='formulas'){
    const prior=existing?JSON.parse(existing.value):null;
    if(prior?.evidenceType==='Teórica')value.evidenceType='Teórica';
    if(value.evidenceType==='Teórica'&&status!=='Borrador')return fail(400,'Registra primero una muestra física en Caracterización. La propuesta teórica permanece como borrador.');
    if(!reviewing&&['Experimental','Validada'].includes(prior?.evidenceType)&&
       ['components','technology','substrate','anilox','target'].some(key=>String(value[key]??'').trim()!==String(prior[key]??'').trim())){
     value.evidenceType='Manual';
     delete value.evidenceId;
     delete value.modeledDelta;
    }
   }
   const updated = now(), serialized = JSON.stringify(value);
   const finalTitle = reviewing ? existing.title : title.trim().slice(0,100);
   const previous=reviewing?JSON.parse(existing.value):null;
   if(previous?.evidenceType==='Experimental'){
    const trial=Number.isSafeInteger(previous.evidenceId)&&await query(`SELECT id FROM records
      WHERE id=? AND owner=? AND kind='caracterizaciones' AND status<>'Archivada'
       AND json_extract(value,'$.verified')=1 AND json_extract(value,'$.mode')='mezcla'`).get(previous.evidenceId,existing.owner);
    if(!trial)return fail(400,'La fórmula experimental requiere un ensayo de mezcla verificado para aprobarse.');
   }
   const finalValue = reviewing
    ? JSON.stringify({...previous,...(previous.evidenceType==='Experimental'?{evidenceType:'Validada'}:{}),...(status==='Compartida' ? {shareScope:shareScopes.includes(value.shareScope) ? value.shareScope : shareScopes[0]} : {})})
    : serialized;
   const snapshot = JSON.stringify({kind,title:finalTitle,value:JSON.parse(finalValue),status});
   const write = existing
    ? ['UPDATE records SET title=?,value=?,status=?,updated=? WHERE id=? AND updated=? AND status=? AND value=?',[finalTitle,finalValue,status,updated,existing.id,existing.updated,existing.status,existing.value]]
    : ['INSERT INTO records(owner,kind,title,value,status,updated) VALUES(?,?,?,?,?,?)',[owner,kind,finalTitle,finalValue,status,updated]];
   const audit = existing
    ? ['INSERT INTO history(actor,record_id,snapshot,created) SELECT ?,?,?,? WHERE changes()=1',[owner,existing.id,snapshot,updated]]
    : ['INSERT INTO history(actor,record_id,snapshot,created) VALUES(?,last_insert_rowid(),?,?)',[owner,snapshot,updated]];
   const statements = existing ? [write,audit] : [write,audit,['DELETE FROM drafts WHERE owner=? AND kind=?',[owner,kind]]];
   const [saved] = await batch(statements);
   if (!saved.changes) return fail(409,'El registro cambió. Actualiza la página y vuelve a intentar.');
   return json(200,{id:Number(existing?.id ?? saved.lastInsertRowid)});
  }
  return fail(404,'Operación no disponible');
 } catch (error) {
  if (/no such table|no such column/i.test(String(error.message))){
   console.error('Falta aplicar una migración en D1');
   return fail(503,'La base de datos de ColorL necesita una migración. Vuelve a desplegar aplicando las migraciones D1.');
  }
  if (String(error.message).includes('records_active_ink_code'))return fail(409,'Ya existe una tinta activa con ese código.');
  if (error.code==='ENOENT') return fail(404,'Archivo no disponible');
  if (error instanceof SyntaxError || error.message.startsWith('Solicitud')) return fail(400,'Solicitud inválida');
  if(iterationLimit(error)&&phase==='password-verification')
   return fail(503,'Este servidor no admite el formato de tu contraseña anterior. Contacta al administrador para restablecerla.');
  const reference=crypto.randomUUID().slice(0,8);
  console.error('ColorL '+path+' '+phase+' '+reference, error.name, error.code||'');
  return fail(500,'No se pudo completar la operación. Referencia: '+reference);
 }
}
