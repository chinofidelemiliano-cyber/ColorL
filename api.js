const hex = bytes => Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('');
const encoder = new TextEncoder();
const hash = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function passwordHash(password,salt){
 const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const digest = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:600000},key,256);
 return 'pbkdf2:'+salt+':'+hex(digest);
}
async function verifyPassword(password,stored,verifyLegacy){
 if(stored && !stored.startsWith('pbkdf2:')) return verifyLegacy?.(password,stored) || false;
 const expected = stored || 'pbkdf2:dummy:'+'0'.repeat(64);
 const actual = await passwordHash(password,expected.split(':')[1]);
 let difference = actual.length ^ expected.length;
 for(let i=0;i<actual.length;i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
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
const kinds = new Set(['colores','formulas','mediciones','correcciones','inventario','anilox','academia','componentes','tintas','caracterizaciones','catalogos']);

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
 try {
  if (method !== 'GET' && req.headers.get('sec-fetch-site') === 'cross-site') return fail(403,'Origen no permitido');
  const token = req.headers.get('cookie')?.match(/(?:^|;\s*)colorl=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session = token && await query('SELECT '+userColumns+' FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(await hash(token),Date.now());
  if (path === '/api/me' && method === 'GET') return json(200,{user:session ? profile(session) : null});
  if (['/api/login','/api/register','/api/recover','/api/reset'].includes(path) && method === 'POST') {
   const stamp = Date.now();
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
   let user = await query('SELECT '+userColumns+' FROM users WHERE email=?').get(email);
   if (path === '/api/register') {
    if (!name) return fail(400,'Escribe tu nombre');
    if (user) return fail(409,'Este correo ya está registrado');
    const code=codeInput(input.invite), administrator=isOwnerBootstrap(config,email,code);
    if(config.ADMIN_INVITE&&config.ADMIN_EMAIL?.trim().toLowerCase()===email&&!administrator)
     return fail(400,'Para registrar el correo administrador, usa el código privado configurado en Cloudflare.');
    const key=administrator||!code ? null : await invitationKey(code);
    if(code&&!administrator&&(!key||!await query('SELECT 1 AS valid FROM access_invitations WHERE code_hash=? AND expires_at>? AND used_by IS NULL').get(key,stamp)))return fail(400,'El código de acceso es inválido, venció o ya se utilizó. Puedes dejarlo vacío para crear una cuenta de comparación.');
    const credential=await passwordHash(password,random()), fresh=random(), expiration=stamp+604800000;
    const params=[email,name,credential,administrator?'administrador':'laboratorista'];
    const registration=key
     ? ['INSERT INTO users(email,name,password,role) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM access_invitations WHERE code_hash=? AND expires_at>? AND used_by IS NULL) ON CONFLICT(email) DO NOTHING',[...params,key,Date.now()]]
     : ['INSERT INTO users(email,name,password,role) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING',params];
    const statements=[['DELETE FROM sessions WHERE expires<=?',[stamp]],registration];
    if(key)statements.push(['UPDATE access_invitations SET used_by=(SELECT id FROM users WHERE email=?), used_at=? WHERE code_hash=? AND changes()=1',[email,stamp,key]]);
    statements.push(['INSERT INTO sessions(token,user_id,expires) SELECT ?,id,? FROM users WHERE email=? AND changes()=1',[await hash(fresh),expiration,email]]);
    const results=await batch(statements), saved=results[1];
    user=await query('SELECT '+userColumns+' FROM users WHERE email=?').get(email);
    if(!saved.changes)return user?fail(409,'Este correo ya está registrado. Inicia sesión para continuar.'):fail(400,'El código de acceso venció o ya se utilizó.');
    if(!user||!results.at(-1).changes)return fail(503,'La cuenta se creó. Intenta iniciar sesión con tu correo y contraseña.');
    headers.set('Set-Cookie','colorl='+fresh+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+secure);
    return json(200,{user:profile(user)});
   } else {
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
   if(kind==='tintas'&&(typeof value.code!=='string'||!value.code.trim()||value.code.length>240||!inkTechnology(value.technology)))return fail(400,'Escribe un código de tinta y una tecnología válidos.');
   if(kind==='tintas')value.codeKey=inkCode(value.code);
   const updated = now(), serialized = JSON.stringify(value);
   const finalTitle = reviewing ? existing.title : title.trim().slice(0,100);
   const finalValue = reviewing
    ? JSON.stringify({...JSON.parse(existing.value),...(status==='Compartida' ? {shareScope:shareScopes.includes(value.shareScope) ? value.shareScope : shareScopes[0]} : {})})
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
  console.error(error.name, error.code || '');
  return fail(500,'No se pudo completar la operación');
 }
}
