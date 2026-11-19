import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { open, unlink } from 'node:fs/promises';

const destination = process.argv[2];
if (!destination) {
 console.error('Uso: npm run backup -- /ruta/segura/colorl.sqlite');
 process.exit(1);
}
const source = resolve(process.env.DATA_DIR || 'data', 'colorl.sqlite');
const output = resolve(destination);
const database = new DatabaseSync(source, { readOnly: true });
const handle = await open(output, 'wx', 0o600);
await handle.close();
try {
 database.prepare('VACUUM INTO ?').run(output);
 const copy = new DatabaseSync(output, { readOnly: true });
 try {
  const report = copy.prepare('PRAGMA quick_check').get();
  if (report.quick_check !== 'ok') throw new Error('No se pudo verificar el respaldo');
 } finally {
  copy.close();
 }
 console.log('Respaldo verificado: '+output);
} catch (error) {
 await unlink(output);
 throw error;
} finally {
 database.close();
}
