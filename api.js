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
const profile = ({id,name,email,role,theme}) => ({id,name,email,role,theme});
const shareScopes = ['Todo el equipo','Laboratorio y supervisión','Solo supervisión'];
const kinds = new Set(['colores','formulas','mediciones','correcciones','inventario','anilox','academia','componentes']);

async function body(req) {
 let data = '';
 const decoder = new TextDecoder();
 for await (const chunk of req.body || []) {
  data += decoder.decode(chunk,{stream:true});
  if (data.length > 200000) throw new Error('Solicitud demasiado grande');
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
  const session = token && await query('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(await hash(token),Date.now());
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
   let user = await query('SELECT * FROM users WHERE email=?').get(email);
   if (path === '/api/register') {
    if (!name) return fail(400,'Escribe tu nombre');
    if (user) return fail(409,'Este correo ya está registrado');
    const salt = random();
    const role = config.ADMIN_EMAIL?.trim().toLowerCase() === email && config.ADMIN_INVITE && input.invite === config.ADMIN_INVITE ? 'administrador' : 'laboratorista';
    const saved = await query('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING').run(email,name,await passwordHash(password,salt),role);
    if (!saved.changes) return fail(409,'Este correo ya está registrado');
    const id = saved.lastInsertRowid;
    user = await query('SELECT * FROM users WHERE id=?').get(id);
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
  if (path === '/api/logout' && method === 'POST') {
   await query('DELETE FROM sessions WHERE token=?').run(await hash(token));
   headers.set('Set-Cookie','colorl=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+secure);
   return json(200,{ok:true});
  }
  if (path === '/api/profile' && method === 'POST') {
   const {name,theme} = await body(req);
   if (typeof name !== 'string' || !name.trim() || !['light','dark'].includes(theme)) return fail(400,'Perfil inválido');
   await query('UPDATE users SET name=?,theme=? WHERE id=?').run(name.trim().slice(0,80),theme,owner);
   return json(200,{user:profile(await query('SELECT * FROM users WHERE id=?').get(owner))});
  }
  if (path === '/api/users' && session.role === 'administrador') {
   if (method === 'GET') return json(200,await query('SELECT id,name,email,role FROM users ORDER BY name').all());
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
   if (!kinds.has(kind) || typeof title !== 'string' || !title.trim() || !value || typeof value !== 'object' || !['Borrador','En revisión','Aprobada','Compartida','Registrada','Completada'].includes(status)) return fail(400,'Registro inválido');
   const existing = id == null ? null : await query('SELECT * FROM records WHERE id=?').get(id);
   const review = ['administrador','supervisor'].includes(session.role);
   const reviewing = existing?.kind==='formulas' && kind==='formulas' && review && ['En revisión','Aprobada','Compartida'].includes(existing.status) && ['Aprobada','Compartida'].includes(status);
   if ((id != null && (!existing || existing.kind!==kind || (existing.owner!==owner && !reviewing))) || (session.role==='estudiante' && kind!=='academia') || (session.role==='operador' && kind!=='mediciones') || (kind==='formulas' && ['Aprobada','Compartida'].includes(status) && !reviewing)) return fail(403,'Permiso insuficiente');
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
  if (error.code==='ENOENT') return fail(404,'Archivo no disponible');
  if (error instanceof SyntaxError || error.message.startsWith('Solicitud')) return fail(400,'Solicitud inválida');
  console.error(error.name, error.code || '');
  return fail(500,'No se pudo completar la operación');
 }
}
