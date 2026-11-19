import {parseSeparated} from './delimited.js';

const textKey=value=>String(value??'').trim().normalize('NFC').toLowerCase();
function csv(text,required){
 const [header,...rows]=parseSeparated(text);
 if(!header||!required.every(key=>header.includes(key)))throw new Error('Faltan columnas: '+required.join(', ')+'.');
 return rows.map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]??''])));
}
const number=value=>String(value??'').trim()===''?NaN:Number(value);
export function referenceTables(data){
 const colors=[], codes=new Set(), bases=new Map(),groups=new Map();
 for(const row of csv(data.colors,['pantone','C','M','Y','K','hex_aproximado','imagen','pagina_pdf'])){
  const code=row.pantone.trim(),key=textKey(code),cmyk=['C','M','Y','K'].map(k=>number(row[k]));
  if(!key||codes.has(key)||!/^#[0-9a-f]{6}$/i.test(row.hex_aproximado)||cmyk.some(n=>!Number.isFinite(n)||n<0||n>100)||
     !/^imagenes\/[\p{L}\d_.-]+\.png$/u.test(row.imagen))throw new Error('Duplicado o valores inválidos en colores.csv: '+code);
  codes.add(key);colors.push({code,key,cmyk,hex:row.hex_aproximado,image:row.imagen,page:row.pagina_pdf});
 }
 for(const row of csv(data.bases,['codigo','nombre','sistema'])){
  const key=JSON.stringify([textKey(row.sistema),textKey(row.codigo)]);
  if(!row.codigo||!row.nombre||!row.sistema||bases.has(key))throw new Error('Componente duplicado o incompleto: '+row.codigo);
  bases.set(key,row.nombre);
 }
 for(const row of csv(data.formulas,['pantone','sistema','componente','porcentaje_peso','fuente_pagina'])){
  const code=textKey(row.pantone),group=JSON.stringify([code,textKey(row.sistema)]),partKey=JSON.stringify([textKey(row.sistema),textKey(row.componente)]),percentage=number(row.porcentaje_peso);
  if(!codes.has(code)||!bases.has(partKey)||!row.fuente_pagina||!Number.isFinite(percentage)||percentage<=0||percentage>100)
   throw new Error('La receta de '+row.pantone+' tiene un componente sin vínculo, fuente o porcentaje válido.');
  const recipe=groups.get(group)||{code,system:row.sistema,parts:[]};
  if(recipe.parts.some(part=>textKey(part.code)===textKey(row.componente)))throw new Error('Componente repetido en '+row.pantone+'.');
  recipe.parts.push({code:row.componente,name:bases.get(partKey),percentage,source:row.fuente_pagina});groups.set(group,recipe);
 }
 for(const formula of groups.values())if(Math.abs(formula.parts.reduce((sum,p)=>sum+p.percentage,0)-100)>.001)throw new Error('Los porcentajes deben sumar 100 %.');
 if(!colors.length||colors.length>5000)throw new Error('El ZIP admite entre 1 y 5,000 colores.');
 return {colors,formulas:[...groups.values()],bases:bases.size};
}
