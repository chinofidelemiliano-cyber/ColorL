import {parseSeparated} from './delimited.js';
import {normalize,parseLab,spectrum} from './lab-model.js';

export const measurementConditions=['M0','M1','M2','M3'];
export const observers=['2°','10°'];
const clean=(value,limit=160)=>String(value??'').trim().slice(0,limit);
const labeled=(value,field)=>{if(!value)throw new Error('Falta '+field+'.');return value;};
export function standardValue(data){
 const reference=labeled(clean(data.target),'el código del patrón');
 const collection=labeled(clean(data.collection),'la colección');
 const illuminant=labeled(clean(data.illuminant).toUpperCase(),'el iluminante');
 const observer=clean(data.observer), condition=clean(data.condition).toUpperCase();
 if(!measurementConditions.includes(condition)||!observers.includes(observer))throw new Error('Selecciona condición M0–M3 y observador de 2° o 10°.');
 const labText=clean(data.lab), spectralText=String(data.spectrum??'').trim();
 if(spectralText.length>7500)throw new Error('La tabla espectral es demasiado extensa.');
 if(!labText&&!spectralText)throw new Error('Ingresa CIELAB, reflectancia o ambos.');
 const lab=labText?parseLab(labText).join(', '):'';
 const points=spectralText?spectrum(spectralText):[];
 if(spectralText&&points.length<2)throw new Error('Ingresa al menos dos lecturas de reflectancia.');
 const rawTolerance=String(data.tolerance??'').trim(), tolerance=rawTolerance?Number(rawTolerance):'';
 if(tolerance!==''&&(!Number.isFinite(tolerance)||tolerance<=0))throw new Error('La tolerancia ΔE₀₀ debe ser mayor que cero.');
 const color=clean(data.color,7);
 return {target:reference,collection,illuminant,observer,condition,geometry:clean(data.geometry),lab,spectrum:points.map(pair=>pair.join(', ')).join('\n'),
  tolerance,hueName:clean(data.hueName),customer:clean(data.customer),product:clean(data.product),job:clean(data.job),substrate:clean(data.substrate),source:clean(data.source,500),
  color:/^#[0-9a-f]{6}$/i.test(color)?color.toLowerCase():'',favorite:false};
}
export function standardKey(value){
 return JSON.stringify(['collection','target','customer','product','job','substrate','illuminant','observer','condition','geometry'].map(key=>normalize(value[key])));
}
const headerAliases={
 nombre:'title',tonalidad:'hueName',codigo:'target',coleccion:'collection',l:'l',a:'a',b:'b',lab:'lab',reflectancia:'spectrum',
 iluminante:'illuminant',observador:'observer',geometria:'geometry',condicion:'condition',tolerancia:'tolerance',
 cliente:'customer',producto:'product',trabajo:'job',sustrato:'substrate',fuente:'source',hex:'color'
};
export function parseStandardsCsv(text){
 const [headers,...rows]=parseSeparated(text);
 if(!headers||!rows.length||rows.length>100)throw new Error('El CSV debe contener entre 1 y 100 patrones.');
 const keys=headers.map(column=>headerAliases[normalize(column).replace(/\*$/,'')]);
 if(!['title','target','collection','illuminant','observer','condition'].every(key=>keys.includes(key)))
  throw new Error('El CSV requiere Nombre, Código, Colección, Iluminante, Observador y Condición.');
 const results=[],seen=new Set();
 rows.forEach((row,index)=>{
  const data=Object.fromEntries(keys.flatMap((key,i)=>key?[[key,row[i]??'']]:[]));
  try{
   const title=labeled(clean(data.title,100),'el nombre');
   if(data.observer==='2'||data.observer==='10')data.observer+='°';
   if(!data.lab&&['l','a','b'].some(key=>data[key])){
    if(!['l','a','b'].every(key=>data[key]?.trim()))throw new Error('Completa L*, a* y b*.');
    data.lab=[data.l,data.a,data.b].join(', ');
   }
   data.spectrum=data.spectrum?.replaceAll('|','\n');
   const value=standardValue(data), key=standardKey(value);
   if(seen.has(key))throw new Error('Este patrón ya aparece en el archivo.');
   seen.add(key);
   results.push({title,value});
  }catch(error){throw new Error('Fila '+(index+2)+': '+error.message);}
 });
 return results;
}
const same=(a,b)=>Boolean(a&&b&&normalize(a)===normalize(b));
export const sameMeasurement=(pattern,context)=>['illuminant','observer','condition'].every(key=>same(pattern[key],context[key]))&&
 (!pattern.geometry||!context.geometry||same(pattern.geometry,context.geometry));
export function nearestStandards(records,query,delta){
 return records.flatMap(record=>{
  const {value}=record;
  if(!value.lab||!sameMeasurement(value,query)||(query.geometry&&!same(value.geometry,query.geometry))||['customer','product','job','substrate'].some(key=>query[key]&&!same(value[key],query[key])))return [];
  try{
   const difference=delta(parseLab(value.lab),query.lab);
   return Number.isFinite(difference)?[{record,difference}]:[];
  }catch{return [];}
 }).sort((a,b)=>a.difference-b.difference);
}
