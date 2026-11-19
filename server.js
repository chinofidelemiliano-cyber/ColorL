import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';

const directory = process.env.DATA_DIR || 'data';
await mkdir(directory, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(directory + '/colorl.sqlite');
db.exec(`
 PRAGMA journal_mode=WAL;
 PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, password TEXT, role TEXT DEFAULT 'laboratorista', theme TEXT DEFAULT 'dark');
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
 CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
 CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY, owner INTEGER REFERENCES users(id), kind TEXT, title TEXT, value TEXT, status TEXT, updated TEXT);
 CREATE TABLE IF NOT EXISTS drafts(owner INTEGER REFERENCES users(id), kind TEXT, content TEXT, PRIMARY KEY(owner,kind));
 CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, actor INTEGER, record_id INTEGER, snapshot TEXT, created TEXT);
`);
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const random = () => randomBytes(32).toString('hex');
const now = () => new Date().toISOString();
const profile = ({id,name,email,role,theme}) => ({id,name,email,role,theme});
const query = sql => db.prepare(sql);
const shareScopes = ['Todo el equipo','Laboratorio y supervisión','Solo supervisión'];
const kinds = new Set(['colores','formulas','mediciones','correcciones','inventario','anilox','academia','componentes']);
const rates = new Map();
const secure = process.env.SECURE_COOKIE === '1' ? '; Secure' : '';
const files = {'/':'index.html','/styles.css':'styles.css','/app.js':'app.js','/hero.webp':'hero.webp','/hero.png':'hero.png'};
const mime = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',webp:'image/webp',png:'image/png'};

async function body(req) {
 let data = '';
 for await (const chunk of req) {
  data += chunk;
  if (data.length > 200000) throw new Error('Solicitud demasiado grande');
 }
 const parsed = JSON.parse(data || '{}');
 if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Solicitud inválida');
 return parsed;
}

http.createServer(async (req,res) => {
 const path = new URL(req.url, 'http://localhost').pathname;
 const method = req.method;
 const json = (status,data) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const fail = (status,error) => json(status,{error});
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','same-origin');
 try {
  if (!path.startsWith('/api/')) {
   const file = files[path];
   if (!file || method !== 'GET') return fail(404,'Página no disponible');
   const content = await readFile(new URL('./public/'+file,import.meta.url));
   res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]});
   return res.end(content);
  }
  if (method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site') return fail(403,'Origen no permitido');
  const token = req.headers.cookie?.match(/(?:^|;\s*)colorl=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session = token && query('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token),Date.now());
  if (path === '/api/me' && method === 'GET') return json(200,{user:session ? profile(session) : null});
  if (['/api/login','/api/register','/api/recover','/api/reset'].includes(path) && method === 'POST') {
   const ip = req.socket.remoteAddress, stamp = Date.now();
   for (const [key,value] of rates) if (value.until < stamp) rates.delete(key);
   const rate = rates.get(ip) || {count:0,until:stamp+60000};
   rates.set(ip,rate);
   if (++rate.count > 25) return fail(429,'Inténtalo de nuevo en un minuto');
   const input = await body(req);
   const {password='',key=''} = input;
   const name = String(input.name || '').trim().slice(0,80);
   const email = String(input.email || '').trim().toLowerCase();
   const validPassword = typeof password === 'string' && password.length >= 10 && password.length <= 200;
   if (path === '/api/recover') {
    if (!process.env.RECOVERY_WEBHOOK) return fail(503,'La recuperación por correo requiere configurar el servicio de correo.');
    const user = query('SELECT id FROM users WHERE email=?').get(email);
    if (user) {
     const reset = random();
     query('DELETE FROM resets WHERE user_id=?').run(user.id);
     query('INSERT INTO resets VALUES(?,?,?)').run(hash(reset),user.id,stamp+1800000);
     const response = await fetch(process.env.RECOVERY_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.RECOVERY_SECRET ? {Authorization:'Bearer '+process.env.RECOVERY_SECRET} : {})},body:JSON.stringify({email,token:reset}),signal:AbortSignal.timeout(5000)});
     if (!response.ok) throw new Error('Servicio de correo no disponible');
    }
    return json(200,{message:'Si la cuenta existe, recibirás un código por correo.'});
   }
   if (path === '/api/reset') {
    if (!validPassword || typeof key !== 'string') return fail(400,'Usa un código válido y una contraseña de 10 a 200 caracteres');
    const reset = query('SELECT * FROM resets WHERE token=? AND expires>?').get(hash(key.trim()),stamp);
    if (!reset) return fail(400,'Código inválido o vencido');
    const salt = random();
    db.exec('BEGIN');
    try {
     query('UPDATE users SET password=? WHERE id=?').run(salt+':'+digest(password,salt),reset.user_id);
     query('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
     query('DELETE FROM resets WHERE user_id=?').run(reset.user_id);
     db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return json(200,{message:'Contraseña actualizada'});
   }
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !validPassword) return fail(400,'Escribe un correo válido y una contraseña de 10 a 200 caracteres');
   let user = query('SELECT * FROM users WHERE email=?').get(email);
   if (path === '/api/register') {
    if (!name) return fail(400,'Escribe tu nombre');
    if (user) return fail(409,'Este correo ya está registrado');
    const salt = random();
    const role = process.env.ADMIN_EMAIL?.trim().toLowerCase() === email && process.env.ADMIN_INVITE && input.invite === process.env.ADMIN_INVITE ? 'administrador' : 'laboratorista';
    const id = query('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)').run(email,name,salt+':'+digest(password,salt),role).lastInsertRowid;
    user = query('SELECT * FROM users WHERE id=?').get(id);
   } else {
    const [salt,expected] = (user?.password || 'dummy:'+ '0'.repeat(128)).split(':');
    const matches = timingSafeEqual(Buffer.from(digest(password,salt),'hex'),Buffer.from(expected,'hex'));
    if (!user || !matches) return fail(401,'Correo o contraseña incorrectos');
   }
   const fresh = random();
   query('DELETE FROM sessions WHERE expires<=?').run(stamp);
   query('INSERT INTO sessions VALUES(?,?,?)').run(hash(fresh),user.id,stamp+604800000);
   res.setHeader('Set-Cookie','colorl='+fresh+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+secure);
   return json(200,{user:profile(user)});
  }
  if (!session) return fail(401,'Inicia sesión para continuar');
  const owner = session.id;
  if (path === '/api/logout' && method === 'POST') {
   query('DELETE FROM sessions WHERE token=?').run(hash(token));
   res.setHeader('Set-Cookie','colorl=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+secure);
   return json(200,{ok:true});
  }
  if (path === '/api/profile' && method === 'POST') {
   const {name,theme} = await body(req);
   if (typeof name !== 'string' || !name.trim() || !['light','dark'].includes(theme)) return fail(400,'Perfil inválido');
   query('UPDATE users SET name=?,theme=? WHERE id=?').run(name.trim().slice(0,80),theme,owner);
   return json(200,{user:profile(query('SELECT * FROM users WHERE id=?').get(owner))});
  }
  if (path === '/api/users' && session.role === 'administrador') {
   if (method === 'GET') return json(200,query('SELECT id,name,email,role FROM users ORDER BY name').all());
   const {id,role} = await body(req);
   if (method !== 'POST' || !Number.isInteger(id) || id===owner || !['administrador','supervisor','laboratorista','operador','estudiante'].includes(role)) return fail(400,'Asignación inválida');
   query('UPDATE users SET role=? WHERE id=?').run(role,id);
   return json(200,{ok:true});
  }
  if (path === '/api/draft') {
   if (['operador','estudiante'].includes(session.role)) return fail(403,'Permiso insuficiente');
   const input = method === 'POST' ? await body(req) : {kind:new URL(req.url,'http://localhost').searchParams.get('kind')};
   if (!['formulas','colores','inventario','anilox','componentes'].includes(input.kind)) return fail(400,'Tipo de borrador inválido');
   if (method === 'GET') {
    const draft = query('SELECT content FROM drafts WHERE owner=? AND kind=?').get(owner,input.kind);
    return json(200,{content:draft ? JSON.parse(draft.content) : null});
   }
   if (method === 'POST' && input.content && typeof input.content === 'object' && !Array.isArray(input.content)) {
    query('INSERT INTO drafts VALUES(?,?,?) ON CONFLICT(owner,kind) DO UPDATE SET content=excluded.content').run(owner,input.kind,JSON.stringify(input.content));
    return json(200,{ok:true});
   }
   return fail(400,'Borrador inválido');
  }
  if (path === '/api/records' && method === 'GET') {
   const review = ['administrador','supervisor'].includes(session.role);
   const records = query(`
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
   records:query('SELECT * FROM records WHERE owner=?').all(owner).map(r=>({...r,value:JSON.parse(r.value)})),
   history:query('SELECT history.* FROM history JOIN records ON records.id=history.record_id WHERE records.owner=? ORDER BY history.id').all(owner).map(r=>({...r,snapshot:JSON.parse(r.snapshot)}))
  });
  if (path === '/api/records' && method === 'POST') {
   const {id,kind,title,value={},status='Borrador'} = await body(req);
   if (!kinds.has(kind) || typeof title !== 'string' || !title.trim() || !value || typeof value !== 'object' || !['Borrador','En revisión','Aprobada','Compartida','Registrada','Completada'].includes(status)) return fail(400,'Registro inválido');
   const existing = id == null ? null : query('SELECT * FROM records WHERE id=?').get(id);
   const review = ['administrador','supervisor'].includes(session.role);
   const reviewing = existing?.kind==='formulas' && kind==='formulas' && review && ['En revisión','Aprobada','Compartida'].includes(existing.status) && ['Aprobada','Compartida'].includes(status);
   if ((id != null && (!existing || existing.kind!==kind || (existing.owner!==owner && !reviewing))) || (session.role==='estudiante' && kind!=='academia') || (session.role==='operador' && kind!=='mediciones') || (kind==='formulas' && ['Aprobada','Compartida'].includes(status) && !reviewing)) return fail(403,'Permiso insuficiente');
   const updated = now(), serialized = JSON.stringify(value);
   const finalTitle = reviewing ? existing.title : title.trim().slice(0,100);
   const finalValue = reviewing
    ? JSON.stringify({...JSON.parse(existing.value),...(status==='Compartida' ? {shareScope:shareScopes.includes(value.shareScope) ? value.shareScope : shareScopes[0]} : {})})
    : serialized;
   db.exec('BEGIN');
   try {
    const recordId = existing ? existing.id : query('INSERT INTO records(owner,kind,title,value,status,updated) VALUES(?,?,?,?,?,?)').run(owner,kind,finalTitle,finalValue,status,updated).lastInsertRowid;
    if (existing) query('UPDATE records SET title=?,value=?,status=?,updated=? WHERE id=?').run(finalTitle,finalValue,status,updated,recordId);
    if (!existing) query('DELETE FROM drafts WHERE owner=? AND kind=?').run(owner,kind);
    query('INSERT INTO history(actor,record_id,snapshot,created) VALUES(?,?,?,?)').run(owner,recordId,JSON.stringify({kind,title:finalTitle,value:JSON.parse(finalValue),status}),updated);
    db.exec('COMMIT');
    return json(200,{id:Number(recordId)});
   } catch (error) {db.exec('ROLLBACK'); throw error;}
  }
  return fail(404,'Operación no disponible');
 } catch (error) {
  if (error.code==='ENOENT') return fail(404,'Archivo no disponible');
  if (error instanceof SyntaxError || error.message.startsWith('Solicitud')) return fail(400,'Solicitud inválida');
  console.error(error.name, error.code || '');
  return fail(500,'No se pudo completar la operación');
 }
}).listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log('ColorL escuchando en el puerto '+(process.env.PORT || 3000)));
