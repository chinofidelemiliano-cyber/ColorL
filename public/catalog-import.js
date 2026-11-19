import {parseSeparated} from './delimited.js';
export {parseSeparated} from './delimited.js';
import { normalize, technologies } from './lab-model.js';

const aliases={
 code:['codigo','code','sku','referencia','product code'],
 name:['nombre','name','producto','product','tinta'],
 pigment:['pigmento','pigment','color index'],
 color:['color hex','hex','color','colour'],
 resin:['resina','resin','vehiculo'],
 compatibility:['compatibilidad','compatibility','familias compatibles'],
 strength:['fuerza colorante','strength','tint strength'],
 technology:['tecnologia','technology','tipo de tinta','tipo'],
 family:['familia','family','linea'],
 manufacturer:['fabricante','manufacturer','marca']
};
const keyByHeader = new Map(Object.entries(aliases).flatMap(([key,labels])=>labels.map(label=>[label,key])));
const keyOf = value => keyByHeader.get(normalize(value).replace(/[:*]+$/,''));
export const MAX_CATALOG_BYTES = 1_000_000;
const MAX_ROWS = 20;
const MAX_PAGES = 20;

function technology(value){
 const text=normalize(value);
 return technologies.find(type=>normalize(type)===text)||({'water based':'Base agua','base acuosa':'Base agua','uv curable':'UV','solvente':'Base solvente','solvent based':'Base solvente'})[text]||'';
}
export function organize(sheets,text=''){
 const records=[];
 for(const sheet of sheets){
  let keys=[];
  for(const row of sheet){
   const mapped=row.map(keyOf);
   if(mapped.includes('code')&&mapped.filter(Boolean).length>=2){keys=mapped;continue;}
   if(!keys.length)continue;
   const item=Object.fromEntries(keys.flatMap((key,i)=>key&&row[i]?[ [key,String(row[i]).trim()] ]:[]));
   if(item.code)records.push(item);
  }
 }
 if(!records.length&&text){
  const fields={};
  for(const line of text.split(/\n/)){
   const i=line.indexOf(':'), key=i>0&&keyOf(line.slice(0,i));
   if(key)fields[key]=line.slice(i+1).trim();
  }
  if(Object.keys(fields).length)records.push(fields);
 }
 return records.map(item=>({...item,technology:technology(item.technology),colorName:item.color||'',color:/^#[\da-f]{6}$/i.test(item.color||'')?item.color:''}));
}
function loadScript(src){
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.onload=resolve;
  script.onerror=()=>{script.remove();reject(new Error('No se pudo cargar el lector de Excel.'));};
  document.head.append(script);
 });
}
let excelLoading;
export async function loadExcel(){
 if(!globalThis.ExcelJS){
  excelLoading ??= loadScript('/vendor/exceljs.js').catch(error=>{excelLoading=undefined;throw error;});
  await excelLoading;
 }
 return globalThis.ExcelJS;
}
async function withOCR(action){
 const {default:tesseract}=await import('/vendor/tesseract.js');
 const worker=await tesseract.createWorker(['spa','eng'],1,{workerPath:'/vendor/ocr.worker.js',langPath:'/vendor',corePath:'/vendor/tesseract-core-lstm.wasm.js',cacheMethod:'none',workerBlobURL:false});
 try{return await action(async image=>(await worker.recognize(image)).data.text);}
 finally{await worker.terminate();}
}
function pdfLines(items){
 const groups=new Map();
 for(const item of items){
  if(!('str' in item)||!item.str.trim())continue;
  const [,,,,x,y]=item.transform;
  const baseline=[...groups.keys()].find(key=>Math.abs(key-y)<2)??y;
  const line=groups.get(baseline)||[];line.push({x,width:item.width,text:item.str});groups.set(baseline,line);
 }
 return [...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>{
  items.sort((a,b)=>a.x-b.x);
  return items.map((item,i)=>(i?(item.x-items[i-1].x-items[i-1].width>8?'\t':' '):'')+item.text.trim()).join('');
 });
}
async function pdf(file){
 const module=await import('/vendor/pdf.mjs');
 module.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
 const loading=module.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,cMapUrl:'/vendor/pdf-cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdf-standard_fonts/',wasmUrl:'/vendor/pdf-wasm/',iccUrl:'/vendor/pdf-iccs/'});
 try{
  const pdf=await loading.promise;
  if(pdf.numPages>MAX_PAGES)throw new Error('Importa un PDF de hasta '+MAX_PAGES+' páginas por archivo.');
  const pageTexts=[],scanned=[];
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number);
   const lines=pdfLines((await page.getTextContent()).items);
   pageTexts[number-1]=lines.join('\n');
   if(lines.join('').length<15)scanned.push(number);
  }
  if(scanned.length)await withOCR(async recognize=>{
   for(const number of scanned){
    const page=await pdf.getPage(number),base=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(2,1700/Math.max(base.width,base.height))});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvas,viewport}).promise;
    pageTexts[number-1]=await recognize(canvas);
   }
  });
  return pageTexts.join('\n');
 }finally{await loading.destroy();}
}
export async function extractCatalog(file){
 if(!file.size||file.size>MAX_CATALOG_BYTES)throw new Error('Selecciona un archivo de hasta 1 MB.');
 const ext=file.name.split('.').pop().toLowerCase();
 let sheets=[],text='';
 if(ext==='csv'||ext==='tsv'){text=await file.text();sheets=[parseSeparated(text)];}
 else if(ext==='xlsx'){
  const excel=await loadExcel();
  const workbook=new excel.Workbook();await workbook.xlsx.load(await file.arrayBuffer());
  workbook.eachSheet(sheet=>{
   const rows=[];sheet.eachRow(row=>{rows.push(Array.from({length:Math.min(row.cellCount,40)},(_,i)=>row.getCell(i+1).text));});sheets.push(rows);
  });
  text=sheets.flat().map(row=>row.join('\t')).join('\n');
 }else if(ext==='pdf'||['png','jpg','jpeg','webp','bmp'].includes(ext)){
  text=ext==='pdf'?await pdf(file):await withOCR(recognize=>recognize(file));
  sheets=[parseSeparated(text)];
 }else throw new Error('Usa PDF, Excel .xlsx, CSV o una imagen PNG, JPEG, WebP o BMP.');
 const items=organize(sheets,text);
 if(items.length>MAX_ROWS)throw new Error('Divide el catálogo en archivos de hasta '+MAX_ROWS+' tintas.');
 return {items,text:text.slice(0,12000)};
}
export async function encodeFile(file){
 const bytes=new Uint8Array(await file.arrayBuffer());let text='';
 for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
