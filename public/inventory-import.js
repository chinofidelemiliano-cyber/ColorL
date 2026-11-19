// These reports print horizontally divided tables on consecutive pages.
const clean = value => String(value ?? '').trim();
const number = value => {
 const source=clean(value).replace(/[$,\s]/g,'');
 return /^-?\d+(?:\.\d+)?$/.test(source)?Number(source):null;
};
function date(text){
 const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
 if(!match)return '';
 const iso=match[3]+'-'+match[2]+'-'+match[1], parsed=new Date(iso+'T00:00:00Z');
 return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===iso?iso:'';
}
function rows(items,bounds){
 const rows=[];
 for(const item of items){
  if(!item.str?.trim())continue;
  const x=item.transform[4]+item.width/2,y=item.transform[5];
  let row=rows.find(r=>Math.abs(r.y-y)<2.3);
  if(!row){row={y,cells:Array.from({length:bounds.length+1},()=>[])};rows.push(row);}
  const index=bounds.findIndex(bound=>x<bound);
  row.cells[index===-1?bounds.length:index].push({x,text:item.str.trim()});
 }
 return rows.sort((a,b)=>b.y-a.y).map(r=>({...r,cells:r.cells.map(cell=>cell.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '))}));
}
const matchY=(row,others)=>others.find(other=>Math.abs(other.y-row.y)<2.4);
const has=(page,text)=>page?.some(item=>item.str?.trim()===text);
export function parseInventoryPages(pages,kind){
 if(kind==='anilox'){
  if(pages.length!==2||!has(pages[0],'LINEAJE')||!has(pages[0],'APORTE REAL')||!has(pages[1],'NOTAS'))
   throw new Error('El PDF no coincide con el formato de anilox de dos páginas.');
  const comments=rows(pages[1],[]);
  const records=rows(pages[0],[72,113,151,215,273]).filter(row=>/^AX\d+$/i.test(row.cells[0])).map(row=>{
   const [code,lineature,nominal,sourceAporte,material,density]=row.cells;
   return {title:code,code,lineature:number(lineature),nominal:number(nominal),sourceAporte:number(sourceAporte),material,density:number(density),notes:matchY(row,comments)?.cells[0]||'',sourcePage:1};
  });
  if(!records.length)return [];
  if(records.some(r=>r.lineature===null||r.nominal===null||r.sourceAporte===null))throw new Error('Hay filas de anilox que requieren revisión del PDF original.');
  return records;
 }
 if(kind!=='inventario'||pages.length!==4||!has(pages[0],'LOTE')||!has(pages[2],'G ACTUAL'))
  throw new Error('El PDF no coincide con el formato de inventario de cuatro páginas.');
 return [0,1].flatMap(index=>{
  const amounts=rows(pages[index+2],[110,175,249]);
  const result=rows(pages[index],[108,181,240,312,359,443]).flatMap(row=>{
   const [title,code,rawTech,supplier,lot,arrival,life]=row.cells;
   const entryDate=date(arrival);
   if(!entryDate)return [];
   const numbers=matchY(row,amounts);
   const [remaining,cost,total,grams]=numbers?.cells||[];
   if(!title||!code||!lot||number(cost)===null||number(grams)===null)throw new Error('No se pudo vincular de forma inequívoca el lote '+(lot||'de la página '+(index+1))+' con su existencia.');
   const technology=rawTech.toLowerCase()==='base agua'?'Base agua':rawTech==='UV'?'UV':'';
   return [{title,code,technology,supplier,lot,entryDate,lifeDays:number(life),reportedDays:number(remaining),cost:number(cost),reportedTotal:number(total),quantity:number(grams)/1000,sourcePage:index+1,quantityPage:index+3}];
  });
  const balanceCount=amounts.filter(r=>number(r.cells[0])!==null&&number(r.cells[3])!==null).length;
  if(!result.length||result.length!==balanceCount)throw new Error('Las dos mitades del inventario no tienen el mismo número de filas. Revisa el formato antes de importar.');
  return result;
 });
}
export async function readInventoryPdf(file,kind){
 if(!file?.size||file.size>1_000_000||!/\.pdf$/i.test(file.name))throw new Error('Selecciona un PDF de hasta 1 MB.');
 const module=await import('/vendor/pdf.mjs');
 module.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
 const loading=module.getDocument({data:await file.arrayBuffer(),isEvalSupported:false});
 try{
  const doc=await loading.promise;
  if(doc.numPages!==(kind==='anilox'?2:4))throw new Error('El número de páginas no corresponde al formato de este inventario.');
  const pages=[];
  for(let page=1;page<=doc.numPages;page++)pages.push((await (await doc.getPage(page)).getTextContent()).items);
  return parseInventoryPages(pages,kind);
 }finally{await loading.destroy();}
}
