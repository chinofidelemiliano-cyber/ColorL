import {encodeFile} from './catalog-import.js';
import {referenceTables} from './zip-reference.js';
import {measurementConditions,observers,standardValue} from './color-standards.js';
import {differences,instrumentReading} from './instrument.js';
import {normalize,readLab,positive} from './lab-model.js';

let loader;
async function archive(buffer){
 if(!globalThis.JSZip){
  loader??=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/vendor/jszip.js';script.onload=resolve;
   script.onerror=()=>{script.remove();loader=null;reject(new Error('No se pudo cargar el lector ZIP.'));};
   document.head.append(script);
  });
  await loader;
 }
 const zip=await globalThis.JSZip.loadAsync(buffer);
 const entries=Object.values(zip.files).filter(entry=>!entry.dir);
 if(entries.length>5100||entries.some(entry=>!Number.isSafeInteger(entry._data?.uncompressedSize)||entry._data.uncompressedSize>700000)||
    entries.reduce((sum,entry)=>sum+entry._data.uncompressedSize,0)>8_000_000)
  throw new Error('El ZIP excede los límites de tamaño descomprimido.');
 const files=['colores.csv','formulas.csv','tintas_base.csv'].map(path=>zip.file(path));
 if(files.some(file=>!file))throw new Error('El ZIP debe contener colores.csv, formulas.csv y tintas_base.csv en la raíz.');
 const [colors,formulas,bases]=await Promise.all(files.map(file=>file.async('string')));
 const ref=referenceTables({colors,formulas,bases});
 const missing=ref.colors.filter(color=>!zip.file(color.image)).length;
 return {...ref,zip,missing};
}
function digital(color){
 const data=color.hex.slice(1).match(/../g).map(byte=>parseInt(byte,16));
 const {lab}=instrumentReading({format:'sRGB',text:data.join(' '),condition:'D65 / 2°'});
 const [,a,b]=lab,angle=(Math.atan2(b,a)*180/Math.PI+360)%360, chroma=Math.hypot(a,b);
 const family=chroma<8?'Neutros':angle<45||angle>=345?'Rojos y rosas':angle<100?'Naranjas y amarillos':angle<175?'Verdes':angle<255?'Cianes':angle<300?'Azules':'Violetas';
 return {...color,lab,family};
}
export function createReferenceLibrary({state,esc,field,btn,modal,api,refresh,render,toast}){
 const owner=()=>state.user?.id, openPacks=()=>state.records.filter(record=>record.owner===owner()&&record.kind==='pack-color');
 const canEdit=()=>state.user?.fullAccess&&!['operador','estudiante'].includes(state.user.role);
 const pending=new WeakMap(), cache=new Map();
 const notice=text=>'<p class="notice">'+esc(text)+'</p>';
 const error='<p class="error" role="alert"></p>';
 const packs=()=>'<details class="panel lab-detail"><summary>Biblioteca cromática digital</summary>'+
  notice('Referencias de pantalla separadas de tus patrones medidos. Las recetas conservan su sistema de tinta y deben validarse físicamente.')+
  (canEdit()?btn('Importar biblioteca ZIP','data-ref-import','file','primary'):'')+
  (openPacks().map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.colors)+' colores · '+esc(record.value.formulas)+' recetas</small></div>'+btn('Explorar','data-ref-pack='+record.id,'palette')+'</div>').join('')||notice('Todavía no hay bibliotecas ZIP cargadas.'))+'</details>';
 async function load(record){
  const key=owner()+'-'+record.id;
  if(!cache.has(key)){
   const response=await fetch('/api/catalog-source?id='+encodeURIComponent(record.value.source));
   if(!response.ok)throw new Error('No se pudo abrir el ZIP de esta cuenta.');
   const data=await archive(await response.arrayBuffer());data.colors=data.colors.map(digital);cache.set(key,data);
   while(cache.size>3)cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
 }
 function library(record,data){
  const families=['Todas','Neutros','Rojos y rosas','Naranjas y amarillos','Verdes','Cianes','Azules','Violetas'];
  modal(record.title,'<form data-ref-form="search"><div class="form-grid">'+field('term','Código o HEX')+
   field('family','Familia cromática',families)+field('kind','Buscar cercanía en',['CIELAB','CIELCh'])+field('query','Lectura de referencia D65 / 2° (opcional)')+
   '</div><div class="form-actions"><button class="primary">Buscar colores</button>'+btn('Comparar dos referencias','data-ref-compare='+record.id,'palette')+'</div>'+error+'<div id="digital-results"></div></form>',true);
  const form=document.querySelector('[data-ref-form=search]');pending.set(form,{data,record});results(form,{});
 }
 function results(form,input){
  const {data,record}=pending.get(form), term=normalize(input.term), lab=input.query?.trim()?readLab(input.query,input.kind):null;
  const filtered=data.colors.filter(color=>(!input.family||input.family==='Todas'||color.family===input.family)&&(!term||normalize(color.code+' '+color.hex).includes(term)));
  const rows=filtered.map(color=>({color,distance:lab?differences(lab,color.lab).e[0]:null}));
  if(lab)rows.sort((a,b)=>a.distance-b.distance);
  form.querySelector('#digital-results').innerHTML=notice(rows.length+' coincidencias. Se muestran hasta 80. '+(lab?'ΔE₀₀ sobre estimaciones digitales D65 / 2°.':''))+
   '<div class="digital-grid">'+rows.slice(0,80).map(({color,distance})=>btn(color.code+' · '+color.hex+(distance==null?'':' · ΔE '+distance.toFixed(2)),
    'style="--ink:'+color.hex+'" data-ref-color='+data.colors.indexOf(color)+' data-pack-id='+record.id,'','digital-tile')).join('')+'</div>';
 }
 async function detail(record,data,index){
  const color=data.colors[index];
  if(!color)return;
  const image=data.zip.file(color.image), encoded=image?await image.async('base64'):'';
  const formulas=data.formulas.filter(recipe=>recipe.code===color.key);
  modal(color.code,notice('Referencia digital aproximada. HEX '+color.hex+' · CMYK '+color.cmyk.join(', ')+' · página indicada '+color.page)+
   (encoded?'<img class="reference-image" alt="Muestra aproximada de pantalla" src="data:image/png;base64,'+esc(encoded)+'">':'')+
   (formulas.length?'<form data-ref-form="scale"><div class="form-grid">'+field('system','Sistema de tinta',formulas.map(f=>f.system))+field('mass','Cantidad de mezcla (g)','number','',true)+
    '</div><div class="form-actions"><button class="primary">Escalar receta documentada</button></div>'+error+'<div class="result" hidden></div></form>':notice('La referencia no tiene una receta vinculada en este ZIP.'))+
   '<div class="form-actions">'+btn('Volver a la biblioteca','data-ref-pack='+record.id)+
   (canEdit()?btn('Registrar patrón medido','data-ref-measure='+index+' data-pack-id='+record.id,'chart'):'')+'</div>');
  const form=document.querySelector('[data-ref-form=scale]');if(form)pending.set(form,{formulas});
 }
 async function submit(form){
  const input=Object.fromEntries(new FormData(form));
  switch(form.dataset.refForm){
   case 'read':{
    if(!canEdit())throw new Error('Tu rol no permite importar una biblioteca.');
    const file=input.file;
    if(!file?.size||file.size>1_000_000||!/\.zip$/i.test(file.name))throw new Error('Selecciona un ZIP de hasta 1 MB.');
    const data=await archive(await file.arrayBuffer());
    pending.set(form,{data,file});form.dataset.refForm='save';
    form.innerHTML=notice(data.colors.length+' colores · '+data.formulas.length+' recetas · '+data.bases+' tintas base · '+data.missing+' imágenes faltantes.')+
     notice('El ZIP se conserva en tu cuenta. Las recetas se quedan como documentación para el sistema de tinta indicado.')+
     field('authorized','Tengo autorización para utilizar esta colección','checkbox')+
     '<div class="form-actions"><button class="primary">Guardar en mi cuenta</button></div>'+error;return;
   }
   case 'save':{
    if(input.authorized!=='on')throw new Error('Confirma la autorización antes de guardar.');
    const {data,file}=pending.get(form);
    await api('reference-pack',{filename:file.name,data:await encodeFile(file),colors:data.colors.length,formulas:data.formulas.length,bases:data.bases,authorized:true});
    await refresh();document.querySelector('#dialog').close();render();toast('Biblioteca ZIP guardada');return;
   }
   case 'search':results(form,input);return;
   case 'compare':{
    const {data}=pending.get(form);
    const a=data.colors.find(c=>normalize(c.code)===normalize(input.a)),b=data.colors.find(c=>normalize(c.code)===normalize(input.b));
    if(!a||!b||a===b)throw new Error('Ingresa dos códigos distintos presentes en este ZIP.');
    const out=form.querySelector('.result');out.hidden=false;
    out.innerHTML='<div class="standard-comparison">'+[a,b].map(c=>'<div><span class="standard-chip" style="--ink:'+c.hex+'"></span>'+esc(c.code+' · '+c.hex)+'</div>').join('')+
     '</div>'+notice('ΔE₀₀ digital '+differences(a.lab,b.lab).e[0].toFixed(2)+'. Las dos lecturas proceden de HEX aproximado bajo D65 / 2°.');
    return;
   }
   case 'measured':{
    if(!canEdit())throw new Error('Tu rol no permite registrar patrones.');
    const {color,record}=pending.get(form);
    const value=standardValue({...input,target:color.code,source:record.title+' · referencia digital vinculada. Informe de medición: '+input.report});
    await api('records',{kind:'colores',title:color.code+' · patrón medido',value:{...value,digitalPack:record.id},status:'Registrada'});
    await refresh();document.querySelector('#dialog').close();render();toast('Patrón medido guardado');return;
   }
   case 'scale':{
    const mass=positive(input.mass,'la cantidad'),recipe=pending.get(form).formulas.find(f=>f.system===input.system);
    if(!recipe)throw new Error('Selecciona el sistema original.');
    const out=form.querySelector('.result');out.hidden=false;
    out.innerHTML=notice(recipe.system+' · receta documentada pendiente de validación física. Conserva los componentes exactos y mide una muestra pequeña.')+
     '<div class="table-scroll"><table class="table"><thead><tr><th>Componente</th><th>Porcentaje</th><th>g</th><th>Fuente o página</th></tr></thead><tbody>'+
     recipe.parts.map(part=>'<tr><td>'+esc(part.code+' · '+part.name)+'</td><td>'+part.percentage+'</td><td>'+(mass*part.percentage/100).toFixed(3)+'</td><td>'+esc(part.source)+'</td></tr>').join('')+'</tbody></table></div>';
   }
  }
 }
 async function click(button){
  const d=button.dataset;
  if(d.refImport!==undefined){
   if(canEdit())modal('Importar biblioteca cromática','<form data-ref-form="read"><label class="field">Archivo ZIP de referencias<input type="file" name="file" accept=".zip,application/zip" required></label>'+
    '<div class="form-actions"><button class="primary">Revisar ZIP</button></div>'+error+'</form>');return;
  }
  const record=openPacks().find(r=>r.id===Number(d.refPack||d.packId||d.refCompare));
  if(!record)return;
  const data=await load(record);
  if(d.refCompare!==undefined){
   modal('Comparar referencias digitales','<form data-ref-form="compare"><div class="form-grid">'+field('a','Primer código','text','',true)+field('b','Segundo código','text','',true)+
    '</div><div class="form-actions"><button class="primary">Comparar</button></div>'+error+'<div class="result" hidden></div></form>');
   pending.set(document.querySelector('[data-ref-form=compare]'),{data});return;
  }
  if(d.refMeasure!==undefined&&canEdit()){
   const color=data.colors[Number(d.refMeasure)];if(!color)return;
   modal('Registrar medición · '+color.code,'<form data-ref-form="measured"><div class="form-grid">'+field('collection','Colección','text','Patrones propios',true)+
    field('lab','CIELAB medido','text','',true)+field('illuminant','Iluminante','text','D50',true)+field('observer','Observador',observers,'2°')+
    field('condition','Condición M',measurementConditions,'M1')+field('geometry','Geometría')+field('customer','Cliente')+field('tolerance','Tolerancia ΔE₀₀','number')+
    field('report','Informe del instrumento o referencia de ensayo','text','',true)+'</div>'+
    '<div class="form-actions"><button class="primary">Guardar patrón medido</button></div>'+error+'</form>');
   pending.set(document.querySelector('[data-ref-form=measured]'),{record,color});return;
  }
  if(d.refColor!==undefined)await detail(record,data,Number(d.refColor));
  else library(record,data);
 }
 return {packs,click,submit,clear:()=>cache.clear()};
}
