import {parseSeparated} from './delimited.js';
import {normalize,spectrum} from './lab-model.js';
import {instrumentReading,opticalEvidence} from './instrument.js';

const formats={cielab:'CIELAB',cielch:'CIELCh',xyz:'XYZ',rgb:'sRGB',srgb:'sRGB',cmyk:'CMYK'};
export function parseInstrumentCsv(text){
 const [raw,...rows]=parseSeparated(text);
 const headers=raw?.map(normalize);
 if(!headers||!['rol','formato','valores','iluminante','observador','condicion'].every(key=>headers.includes(key))||rows.length!==2)
  throw new Error('El CSV requiere rol, formato, valores, iluminante, observador y condicion, más dos filas: patrón y muestra.');
 const data={};
 for(const row of rows){
  const v=Object.fromEntries(headers.map((key,i)=>[key,row[i]??'']));
  const role=normalize(v.rol),format=Object.hasOwn(formats,normalize(v.formato))?formats[normalize(v.formato)]:null;
  const illuminant=v.iluminante.toUpperCase().trim(), observer=v.observador.trim().replace(/°$/,'');
  const m=v.condicion.trim().toUpperCase(), condition=illuminant+' / '+observer+'°';
  if(!['patron','muestra'].includes(role)||data[role]||!format||!illuminant||!['2','10'].includes(observer)||!['M0','M1','M2','M3'].includes(m))
   throw new Error('Identifica un patrón y una muestra con formato, iluminante, observador y condición M válidos.');
  const readings=instrumentReading({format,text:v.valores,profile:v.perfil,iccLab:v.lab_icc,condition});
  const reflectance=spectrum((v.reflectancia||'').replaceAll('|','\n')).map(pair=>pair.join(', ')).join('\n');
  data[role]={...readings,text:v.valores,iccLab:v.lab_icc||'',density:v.densidad||'',filter:v.filtro||'',reflectance,condition,m,geometry:v.geometria||'',backing:v.fondo||''};
 }
 const {patron:p,muestra:q}=data;
 if(p.condition!==q.condition||p.m!==q.m||normalize(p.geometry)!==normalize(q.geometry)||normalize(p.backing)!==normalize(q.backing))throw new Error('Patrón y muestra deben compartir iluminante, observador, condición M, geometría y fondo.');
 if((p.density&&!p.filter)||(q.density&&!q.filter)||(p.density&&q.density&&normalize(p.filter)!==normalize(q.filter)))
  throw new Error('Las densidades necesitan un filtro identificado y comparable.');
 opticalEvidence(p.reflectance,q.reflectance,p.density,q.density);
 return {pattern:p,sample:q,condition:p.condition,mode:p.m,geometry:p.geometry,backing:p.backing,filter:p.filter||q.filter};
}
