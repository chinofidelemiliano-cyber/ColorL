import {defectNames,diagnosis} from './press-diagnosis.js';
import {displayLab} from './instrument.js';
import {context, diagnostic, linkInventory, mixture, normalize, positive, processFields, readLab, recipeVariants, scale, spectrum, symptoms, technologies} from './lab-model.js';
import {encodeFile,extractCatalog,parseSeparated} from './catalog-import.js';

export const inkFields=[
 ['code','Código'],['manufacturer','Fabricante'],['family','Familia'],['technology','Tecnología',technologies],
 ['pigment','Pigmento'],['colorName','Nombre del color'],['color','Muestra sRGB','color'],['resin','Resina o vehículo'],
 ['strength','Fuerza colorante y unidad'],['compatibility','Familias compatibles (separadas por comas)'],['substrates','Sustratos compatibles (separados por comas)'],
 ['inactive','Sin existencia disponible','checkbox'],['stockGrams','Existencia (g), si se conoce','number'],['manufacturerVerified','Dosificación confirmada con ficha del fabricante','checkbox'],
 ['application','Aplicación',['',...symptoms]],['diagnosisDirection','Objetivo de la intervención'],['doseMin','Dosificación mínima documentada (% sobre masa inicial)','number'],['doseMax','Dosificación máxima documentada (% sobre masa inicial)','number'],
 ['reference','Referencia de la ficha técnica'],['procedure','Procedimiento del fabricante y fundamento','textarea'],['risks','Riesgos, límites y verificación','textarea']
];

export function createLab({state,esc,field,heading,btn,modal,auth,api,refresh,render,toast,statusTag,delta}){
 const query=(root,selector)=>root.querySelector(selector);
 const views={};
 const pending=new WeakMap();
 const editable=()=>state.user&&!['operador','estudiante'].includes(state.user.role);
 const own=kind=>state.records.filter(r=>r.kind===kind&&r.owner===state.user?.id&&r.status!=='Archivada');
 const inks=()=>linkInventory(own('tintas').map(r=>({...r,value:{...r.value,available:r.value.available!==false&&!r.value.inactive}})),own('inventario'));
 const available=()=>inks().filter(r=>r.value.available);
 const approved=()=>own('formulas').filter(r=>['Aprobada','Compartida'].includes(r.status));
 const options=(name,label,records,required=false)=>'<label class="field">'+esc(label)+'<select name="'+name+'" '+(required?'required':'')+'><option value="">Seleccionar</option>'+records.map(r=>'<option value="'+r.id+'">'+esc(r.title)+'</option>').join('')+'</select></label>';
 const conditions=()=>field('technology','Tecnología',technologies)+field('substrate','Sustrato y tratamiento','text','',true)+
  options('aniloxRecord','Anilox de mi inventario',own('anilox').filter(r=>Number(r.value.real)>0))+
  field('anilox','Código de anilox','text','',true)+field('bcm','Aporte real medido (BCM)','number','',true)+
  field('condition','Condición de medición',['M0','M1','M2','M3'],'M1')+field('illuminant','Iluminante y observador','text','D50 / 2°',true).replace('name="illuminant"','name="illuminant" list="lab-measure-lights"')+
  '<datalist id="lab-measure-lights">'+['D50','D65','D55','D75','A','F2','F11'].flatMap(light=>['2°','10°'].map(observer=>'<option value="'+light+' / '+observer+'">')).join('')+'</datalist>'+
  '<details class="wide"><summary>Condiciones adicionales de impresión</summary><div class="form-grid">'+processFields.map(([key,label,type])=>field(key,label,type)).join('')+'</div></details>';
 function change(field){
  if(field.name!=='aniloxRecord'||!field.form?.dataset.lab)return;
  const roller=own('anilox').find(record=>record.id===Number(field.value));
  if(!roller)return;
  for(const [name,value] of Object.entries({anilox:roller.value.code,bcm:roller.value.real,lineature:roller.value.lineature,nominalBcm:roller.value.nominal}))
   field.form.elements.namedItem(name).value=value??'';
 }

 const codeFor=id=>inks().find(r=>r.id===id)?.value.code||'—';
 const nameFor=id=>inks().find(r=>r.id===id)?.title||'Tinta archivada';
 const number=n=>Number(n).toFixed(3);
 const partsTable=parts=>'<ol class="lab-list">'+parts.map(part=>'<li><strong>'+esc(codeFor(part.id))+' · '+esc(nameFor(part.id))+'</strong> — '+number(part.grams)+' g ('+Number(part.grams/1000).toFixed(6)+' kg)'+(part.percent==null?'':' · '+number(part.percent)+' %')+(part.difference==null?'':' · cambio '+(part.difference>=0?'+':'')+number(part.difference)+' g')+'</li>').join('')+'</ol>';
 const blank=text=>'<p class="notice">'+esc(text)+'</p>';
 const output='<p class="error" role="alert"></p><div class="result" aria-live="polite" hidden></div>';
 const dataOf=form=>Object.fromEntries(new FormData(form));
 function result(form,html){const target=query(form,'.result');target.hidden=false;target.innerHTML=html;}
 async function persist(record){
  const response=await api('records',record);await refresh();return response;
 }
 function inkEditor(record){
  if(!state.user)return auth();
  if(!editable()){
   if(!record)throw new Error('Tu rol permite consultar el catálogo.');
   return modal(record.title,inkFields.filter(([key])=>typeof record.value[key]==='string'&&record.value[key]).map(([key,label])=>blank(label+' · '+record.value[key])).join(''));
  }
  const v=record?.value||{};
  modal(record?'Editar tinta':'Agregar tinta','<form data-lab="ink" data-id="'+(record?.id||'')+'"><div class="form-grid">'+field('title','Nombre','text',record?.title,true)+inkFields.map(([key,label,type])=>field(key,label,type,key==='inactive'?(Boolean(v.inactive)||v.available===false):v[key],key==='code')).join('')+'</div><div class="form-actions"><button class="primary">Guardar tinta</button>'+(record?btn('Quitar del catálogo','data-lab-archive="'+record.id+'"'):'')+'</div>'+output+'</form>');
 }
 const fileInput='<label class="field">Archivo original<input name="file" type="file" accept=".pdf,.xlsx,.csv,.tsv,.png,.jpg,.jpeg,.webp,.bmp" required></label>';
 function importer(){
  if(!state.user)return auth();
  if(!editable())throw new Error('Tu rol permite consultar el catálogo.');
  modal('Importar catálogo o ficha','<form data-lab="import">'+fileInput+blank('PDF, Excel .xlsx, CSV e imágenes. Hasta 1 MB, 20 páginas o 20 tintas por archivo. Revisa la extracción antes de guardarla.')+'<button class="primary">Leer archivo</button>'+output+'</form>');
 }
 function reviewImport(form,{items,text},file){
  pending.set(form,{file});
  form.dataset.lab='import-save';
  form.innerHTML='<p class="notice">Confirma el nombre, el código y la tecnología. Puedes conservar la ficha como referencia aunque no contenga filas importables.</p>'+field('text','Texto extraído','textarea',text)+'<div id="ink-import-rows">'+items.map(importRow).join('')+'</div><div class="form-actions">'+btn('Agregar fila','data-lab-row')+'<button class="primary">Guardar catálogo</button></div>'+output;
 }
 function importRow(item={}){
  const fields=[['name','Nombre'],['code','Código'],['technology','Tecnología',['',...technologies]],['pigment','Pigmento'],['resin','Resina'],['compatibility','Compatibilidad'],['strength','Fuerza colorante'],['manufacturer','Fabricante'],['family','Familia'],['colorName','Color']];
  return '<div class="panel import-row"><div class="form-grid">'+fields.map(([key,label,type])=>field(key,label,type,item[key],['name','code','technology'].includes(key))).join('')+
   field('available','Confirmo que tengo esta tinta','checkbox',false)+'</div><input type="hidden" name="color" value="'+esc(item.color||'')+'"><div class="form-actions">'+btn('Quitar fila','data-lab-remove-row')+'</div></div>';
 }
 views.tintas=()=>{
  const rows=inks();
  return heading('Catálogo de tintas','Organiza tintas, resinas y aditivos de las familias que tienes disponibles.',editable()||!state.user?btn('Agregar tinta','data-lab-ink','plus','primary'):'')+
   '<div class="form-actions lab-actions">'+btn('Importar catálogo o ficha','data-lab-import','file')+'</div><section class="panel">'+
   (rows.length?'<div class="table-scroll"><table class="table"><thead><tr><th>Código</th><th>Tinta</th><th>Tecnología</th><th>Disponibilidad</th></tr></thead><tbody>'+
    rows.map(r=>'<tr><td>'+esc(r.value.code)+'</td><td>'+btn(r.title,'data-lab-ink="'+r.id+'"','','text-button')+'</td><td>'+esc(r.value.technology)+'</td><td>'+statusTag(r.value.available?'Disponible':'Sin existencia')+'</td></tr>').join('')+'</tbody></table></div>':blank('Todavía no tienes tintas en tu catálogo.'))+'</section><div class="section-head"><h2>Catálogos y fichas</h2></div><section class="panel">'+
   (own('catalogos').filter(r=>!r.value.importKind).map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.value.count)+' tintas importadas</small></div>'+btn('Ver extracción','data-lab-document="'+r.id+'"','','text-button')+' <a class="text-button" href="/api/catalog-source?id='+encodeURIComponent(r.value.source)+'">Descargar original</a></div>').join('')||blank('Todavía no has importado documentos.'))+'</section>';
 };
 views.caracterizaciones=()=>heading('Caracterización','Registra ensayos de mezcla y correcciones medidos en condiciones reproducibles.')+
  '<form class="panel" data-lab="trial"><div class="form-grid">'+field('title','Nombre del ensayo','text','',true)+field('mode','Tipo de ensayo',['Mezcla','Ajuste de una mezcla'])+conditions()+
  field('parts','Composición inicial en orden de incorporación (un código: gramos por línea)','textarea','',true)+
  field('before','CIELAB antes (solo para ajuste)')+field('after','CIELAB medido al final','text','',true)+
  field('additions','Adiciones ensayadas (un código: gramos por línea)','textarea')+field('reflectance','Reflectancia final (%), una línea nm, porcentaje','textarea')+
  options('formula','Fórmula aprobada relacionada',approved())+field('notes','Procedimiento, condiciones y observaciones','textarea')+
  field('verified','Confirmo que medí y verifiqué este ensayo','checkbox')+'</div><div class="form-actions"><button class="primary">Guardar ensayo</button></div>'+output+'</form>'+
  '<div class="section-head"><h2>Ensayos guardados</h2></div><section class="panel">'+(own('caracterizaciones').map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.value.conditions?.substrate)+' · '+esc(r.value.conditions?.bcm)+' BCM</small></div>'+
  btn('Ver ensayo','data-lab-trial="'+r.id+'"','','text-button')+statusTag(r.value.verified?'Verificado':'Por verificar')+'</div>').join('')||blank('Añade un ensayo para empezar a generar recomendaciones.'))+'</section>';
 const finishes=['Sin recubrimiento','Barniz','Laminado','Otro'];
 const lights=['D50','D65','D55','D75','A','F2','F11'];
 const recipeRow=(part={})=>{
  const options=inks().map(ink=>'<option value="'+ink.id+'" '+(ink.id===part.id?'selected':'')+'>'+
   esc([ink.value.code,ink.title,ink.value.colorName||ink.value.color].filter(Boolean).join(' · '))+'</option>').join('');
  return '<div class="recipe-part"><label class="field">Tinta<select name="ink"><option value="">Seleccionar</option>'+options+'</select></label>'+
   field('grams','Gramos pesados','number',part.grams??'')+btn('Quitar','data-lab-remove-part')+'</div>';
 };
 const workflowView=()=>'<form class="panel pantone-workflow" data-lab="recipe">'+
  '<h2>1. Identifica el color</h2><div class="form-grid">'+field('title','Código Pantone o identificador')+'</div>'+
  '<p class="muted">Para guardar, captura los valores medidos de la muestra que preparaste. Para buscar una receta por código, estos valores son opcionales.</p>'+
  '<div class="recipe-coordinates">'+['L*','a*','b*'].map((label,i)=>field('lab'+i,label,'number')).join('')+'</div><div data-lab-preview></div>'+
  '<h2>2. Registra las condiciones de impresión</h2><div class="form-grid">'+
  field('technology','Tipo de tinta',technologies)+field('substrate','Material, color y tratamiento del sustrato')+
  field('lineature','Lineatura (líneas por pulgada)','number')+field('bcm','Aporte real (BCM)','number')+
  field('finish','Recubrimiento',finishes)+'<div data-finish-detail hidden>'+field('finishDetail','Producto o referencia del recubrimiento')+'</div>'+
  field('light','Iluminante',lights,'D50')+field('observer','Observador',['2°','10°'])+'</div>'+
  '<h2>3. Guarda o prepara la receta</h2><div class="form-grid">'+
  field('batch','Cantidad que quieres preparar','number')+field('unit','Unidad',['kg','g'])+'</div>'+
  '<div class="form-actions"><button name="action" value="lookup">Buscar y escalar receta</button></div><div data-lab-proposals hidden></div>'+
  '<h3>Tintas que realmente pesaste</h3><div data-recipe-parts>'+recipeRow()+'</div>'+
  '<div class="form-actions">'+btn('Agregar tinta','data-lab-add-part','plus')+btn('Cargar componentes CSV','data-lab-import-recipe','file')+
  '<button class="primary" name="action" value="save">Guardar receta medida</button></div>'+output+'</form>';
 views.igualacion=()=>heading('Nueva fórmula de Pantone','Guarda tus recetas medidas y escala una mezcla existente al tamaño de lote que necesitas.')+
  workflowView()+
  '<details class="panel lab-detail"><summary>Diagnóstico de impresión</summary><form data-lab="defect"><div class="form-grid">'+
  field('defect','Síntoma observado',defectNames)+'</div><div class="form-actions"><button class="primary">Consultar procedimiento</button></div>'+output+'</form></details>'+
  '<details class="panel lab-detail"><summary>Diagnóstico fisicoquímico</summary><form data-lab="diagnostic"><div class="form-grid">'+
  field('application','Propiedad',symptoms)+field('direction','Objetivo (tal como figura en la ficha)','text','',true)+field('technology','Tecnología',technologies)+
  field('family','Familia exacta de la tinta','text','',true)+field('substrate','Sustrato exacto','text','',true)+field('batch','Masa del lote (g)','number','',true)+'</div><div class="form-actions"><button class="primary">Buscar productos documentados</button></div>'+output+ '</form></details>';
 function recipeLab(input,required=false){
  const values=[input.lab0,input.lab1,input.lab2];
  if(!required&&values.every(value=>!value?.trim()))return null;
  if(values.some(value=>!value?.trim()))throw new Error('Completa L*, a* y b* por separado.');
  return readLab(values.join(', '),'CIELAB');
 }
 function recipeContext(input){
  const substrate=input.substrate.trim(), detail=input.finish==='Sin recubrimiento'?'':input.finishDetail.trim();
  if(!substrate)throw new Error('Indica el material del sustrato.');
  if(input.finish!=='Sin recubrimiento'&&!detail)throw new Error('Indica el producto o la referencia del recubrimiento.');
  return {technology:input.technology,substrate,lineature:positive(input.lineature,'La lineatura'),
   bcm:positive(input.bcm,'El aporte real'),finish:input.finish,finishDetail:detail,
   finishing:input.finish==='Sin recubrimiento'?input.finish:input.finish+' · '+detail,
   illuminant:input.light+' / '+input.observer};
 }
 function showRecipe(form,input){
  const title=input.title.trim(),conditions=recipeContext(input);
  if(!title)throw new Error('Ingresa el código del color que quieres repetir.');
  const grams=positive(input.batch,'La cantidad a preparar')*(input.unit==='kg'?1000:1);
  if(!Number.isFinite(grams))throw new Error('La cantidad a preparar es demasiado grande.');
  const matches=recipeVariants(own('formulas'),inks(),{code:title,conditions,grams,target:recipeLab(input)},delta).slice(0,5);
  const proposals=query(form,'[data-lab-proposals]');
  pending.set(proposals,matches);proposals.hidden=false;
  proposals.innerHTML=matches.length?matches.map(({record,parts,changes,measured,available},i)=>{
   const contextual=[];
   if(changes.includes('Material'))contextual.push('La absorción y el color del fondo cambian la apariencia. Prueba sobre el material real.');
   if(changes.some(key=>['Aporte BCM','Lineatura'].includes(key)))contextual.push('El BCM y la lineatura influyen en la película. Confirma la transferencia en una prueba.');
   if(changes.includes('Recubrimiento'))contextual.push('Aplica el acabado real antes de medir; el brillo y la apariencia pueden variar.');
   if(changes.includes('Iluminante y observador'))contextual.push('Compara bajo la luz solicitada. Para predecir el cambio entre luces hacen falta mediciones espectrales.');
   return '<section class="lab-candidate"><h3>'+esc(record.title)+'</h3><p>'+esc(record.value.substrate||'Material sin registrar')+' · '+esc(record.value.processConditions?.finishing||'Recubrimiento sin registrar')+' · '+esc(record.value.processConditions?.illuminant||'Iluminante sin registrar')+'</p>'+
    blank(changes.length?'Punto de partida escalado. Condiciones distintas o sin registrar: '+changes.join(', ')+'. Confirma el color antes de preparar todo el lote.':
     measured?'Receta medida en las mismas condiciones registradas. Se usan las proporciones de esa prueba y se escalan al lote solicitado.':'Coinciden las condiciones guardadas. Comprueba el color de la mezcla con una medición.')+
    (contextual.length?'<ul>'+contextual.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>':'')+partsTable(parts)+
    (available?btn('Cargar como referencia','data-lab-use-recipe="'+i+'"'):blank('Revisa tintas sin disponibilidad, sin correspondencia en el catálogo o con existencia insuficiente.'))+'</section>';
  }).join(''):blank('No hay una receta utilizable para ese código y tipo de tinta. Registra una composición medida para poder recuperarla.');
 }
 async function saveRecipe(form,input){
  const title=input.title.trim(),conditions=recipeContext(input),lab=recipeLab(input,true);
  if(!title)throw new Error('Ingresa el código del color.');
  const seen=new Set();
  const parts=[...form.querySelectorAll('.recipe-part')].map(row=>{
   const id=Number(query(row,'[name=ink]').value), raw=query(row,'[name=grams]').value;
   if(!id&&!raw)return null;
   const ink=inks().find(ink=>ink.id===id);
   if(!ink||seen.has(id))throw new Error('Selecciona una tinta del catálogo en cada fila y evita repetirla.');
   if(ink.value.technology!==conditions.technology)throw new Error('Verifica que todas las tintas correspondan al tipo de tinta indicado.');
   seen.add(id);
   return {id,grams:positive(raw,'Los gramos de '+ink.title)};
  }).filter(Boolean);
  const batch=parts.reduce((sum,p)=>sum+p.grams,0);
  if(!parts.length||!Number.isFinite(batch))throw new Error('Agrega las tintas y gramajes que realmente pesaste.');
  await persist({kind:'formulas',title,status:'Borrador',value:{
   recipeCode:title,target:title,targetLab:lab,finalLab:lab,technology:conditions.technology,substrate:conditions.substrate,
   anilox:conditions.lineature+' lpi · '+conditions.bcm+' BCM',batch:String(batch),processConditions:conditions,
   color:displayLab(lab,conditions.illuminant)?.hex||'',weighedParts:parts,
   ingredients:parts.map(part=>({id:part.id,code:codeFor(part.id),name:nameFor(part.id),color:inks().find(ink=>ink.id===part.id)?.value.colorName||inks().find(ink=>ink.id===part.id)?.value.color||''})),
   components:scale(parts,batch).map(p=>codeFor(p.id)+': '+p.percent.toFixed(6)).join('\n'),
   evidenceType:'Manual',notes:'Receta pesada y medida por el usuario.'
  }});
  result(form,blank('Receta guardada · '+number(batch)+' g')+partsTable(scale(parts,batch)));
  toast('Receta medida guardada');
 }
 async function importRecipe(form){
  const file=form.elements.file.files[0];
  const {host}=pending.get(form);
  if(!file||file.size>1000000)throw new Error('Elige un CSV de hasta 1 MB.');
  const [headers=[],...rows]=parseSeparated(await file.text());
  const keys=headers.map(normalize),codeIndex=keys.indexOf('codigo'),gramsIndex=keys.indexOf('gramos');
  if(codeIndex<0||gramsIndex<0||!rows.length||rows.length>100)throw new Error('Usa las columnas codigo y gramos, con 1 a 100 tintas.');
  const parts=mixture(rows.map(row=>String(row[codeIndex]||'')+': '+String(row[gramsIndex]||'').replace(',','.')).join('\n'),inks());
  query(host,'[data-recipe-parts]').innerHTML=parts.map(recipeRow).join('');
  query(host,'.result').hidden=true;
  document.querySelector('#dialog').close();
  toast('Componentes cargados para revisión');
 }
 async function submit(form,submitter){
  const input=dataOf(form);
  const mode=form.dataset.lab;
  if(!state.user){auth();return;}
  if(!editable())throw new Error('Tu rol permite consultar los resultados.');
  switch(mode){
   case 'import':{
    const file=query(form,'[name=file]').files[0];
    result(form,blank('Leyendo el archivo en este navegador…'));
    reviewImport(form,await extractCatalog(file),file);return;
   }
   case 'import-save':{
    const {file}=pending.get(form), rows=[...form.querySelectorAll('.import-row')];
    const items=rows.map(row=>Object.fromEntries([...row.querySelectorAll('[name]')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])));
    const codes=new Set(inks().map(ink=>normalize(ink.value.code)));
    for(const item of items){
     const code=normalize(item.code);
     if(codes.has(code))throw new Error('El código «'+item.code+'» ya existe. Edítalo en el catálogo o quita esta fila.');
     codes.add(code);
    }
    await api('catalog-import',{filename:file.name,data:await encodeFile(file),items,text:input.text.slice(0,12000)});
    await refresh();document.querySelector('#dialog').close();render();toast('Catálogo guardado');return;
   }
   case 'ink':{
    const {title,...value}=input;const id=Number(form.dataset.id)||undefined;
    if(value.stockGrams!==''&&(!Number.isFinite(Number(value.stockGrams))||Number(value.stockGrams)<0))throw new Error('La existencia debe ser positiva o cero.');
    if(!value.code.trim())throw new Error('El código es obligatorio.');
    if(inks().some(r=>r.id!==id&&normalize(r.value.code)===normalize(value.code)))throw new Error('Ya existe una tinta con ese código.');
    if(value.manufacturerVerified==='on'){
     if(!value.reference.trim()||!value.procedure.trim()||!value.risks.trim())throw new Error('Completa la ficha, el procedimiento y los riesgos documentados.');
    }
    const previous=own('tintas').find(r=>r.id===id)?.value;
    await persist({id,kind:'tintas',title,status:'Registrada',value:{...previous,...value,inactive:input.inactive==='on',available:input.inactive!=='on',manufacturerVerified:input.manufacturerVerified==='on'}});
    document.querySelector('#dialog').close();render();toast('Tinta guardada');return;
   }
   case 'trial':{
    const ctx=context(input),parts=mixture(input.parts,available()), mode=input.mode==='Mezcla'?'mezcla':'ajuste';
    const additions=mode==='ajuste'?mixture(input.additions,available()):[];
    if([...parts,...additions].some(part=>normalize(inks().find(r=>r.id===part.id)?.value.technology)!==normalize(ctx.technology)))throw new Error('Los componentes deben corresponder a la tecnología seleccionada.');
    const value={conditions:ctx,mode,parts,additions,before:mode==='ajuste'?readLab(input.before,'CIELAB'):null,after:readLab(input.after,'CIELAB'),
     reflectance:spectrum(input.reflectance),notes:input.notes,verified:input.verified==='on',formulaId:Number(input.formula)||null};
    await persist({kind:'caracterizaciones',title:input.title,value,status:'Registrada'});render();toast('Ensayo guardado');return;
   }
   case 'recipe':if(submitter?.value==='save')await saveRecipe(form,input);else showRecipe(form,input);return;
   case 'recipe-import':await importRecipe(form);return;
   case 'defect':{
    const steps=diagnosis(input.defect);
    if(!steps)throw new Error('Selecciona un síntoma.');
    result(form,['Causa física o química','Qué medir primero','Prueba o acción autorizada','Riesgo de un ajuste incorrecto'].map((label,i)=>
     '<p><strong>'+esc(label)+'</strong> '+esc(steps[i])+'</p>').join(''));return;
   }
   case 'diagnostic':{
    const products=diagnostic(available(),input);
    result(form,products.length?products.map(({ink,min,max,minGrams,maxGrams})=>'<section class="lab-candidate"><h3>'+esc(ink.title)+'</h3><p>Intervalo de ficha: '+number(min)+'–'+number(max)+' % · '+number(minGrams)+'–'+number(maxGrams)+' g sobre la masa inicial.</p><p><strong>Procedimiento y fundamento</strong> '+esc(ink.value.procedure)+'</p><p><strong>Riesgos y verificación</strong> '+esc(ink.value.risks)+'</p><p><strong>Fuente</strong> '+esc(ink.value.reference)+'</p></section>').join('')+
    blank('El intervalo procede de la ficha registrada. Verifica las condiciones del fabricante y realiza una prueba controlada antes de ajustar el lote.'):
    blank('No se encontró un producto disponible con compatibilidad, objetivo y dosificación documentados para estas condiciones.'));return;
   }
  }
 }
 async function click(button){
  const d=button.dataset;
  if(d.labInk!==undefined){inkEditor(own('tintas').find(r=>r.id===Number(d.labInk)));return true;}
  if(d.labImport!==undefined){importer();return true;}
  if(d.labArchive){
   const r=own('tintas').find(r=>r.id===Number(d.labArchive));if(!r)return true;
   if(confirm('¿Quitar esta tinta del catálogo activo? El historial de sus ensayos se conserva.')){
    await persist({id:r.id,kind:r.kind,title:r.title,value:r.value,status:'Archivada'});document.querySelector('#dialog').close();render();toast('Tinta retirada del catálogo');
   }
   return true;
  }
  if(d.labDocument){const r=own('catalogos').find(r=>r.id===Number(d.labDocument));if(r)modal(r.title,'<pre class="catalog-text">'+esc(r.value.text||'Sin texto recuperado.')+'</pre>');return true;}
  if(d.labTrial){
   const r=own('caracterizaciones').find(r=>r.id===Number(d.labTrial));
   if(r)modal(r.title,blank('CIELAB final: '+r.value.after.join(', '))+
    (r.value.before?blank('CIELAB inicial: '+r.value.before.join(', ')):'')+partsTable(r.value.parts)+
    (r.value.additions?.length?'<h3>Adiciones</h3>'+partsTable(r.value.additions):'')+blank(r.value.notes)+
    (r.value.reflectance?.length?'<pre class="catalog-text">'+esc(r.value.reflectance.map(p=>p.join(', ')).join('\n'))+'</pre>':''));
   return true;
  }
  if(d.labRow!==undefined){document.querySelector('#ink-import-rows').insertAdjacentHTML('beforeend',importRow());return true;}
  if(d.labRemoveRow!==undefined){button.closest('.import-row').remove();return true;}
  if(d.labAddPart!==undefined){
   query(button.form,'[data-recipe-parts]').insertAdjacentHTML('beforeend',recipeRow());return true;
  }
  if(d.labRemovePart!==undefined){button.closest('.recipe-part').remove();return true;}
  if(d.labImportRecipe!==undefined){
   if(!editable())throw new Error('Tu rol permite consultar las recetas.');
   modal('Cargar componentes de una receta','<form data-lab="recipe-import">'+blank('Usa un CSV con columnas codigo y gramos. Los códigos deben existir en tu catálogo. Revisa los componentes cargados antes de guardar.')+
    '<label class="field">Archivo CSV<input type="file" name="file" accept=".csv" required></label><button class="primary">Cargar para revisión</button>'+output+'</form>');
   pending.set(document.querySelector('[data-lab=recipe-import]'),{host:button.form});return true;
  }
  if(d.labUseRecipe!==undefined){
   const form=button.form,match=pending.get(query(form,'[data-lab-proposals]'))?.[Number(d.labUseRecipe)];
   if(match?.available){
    query(form,'[data-recipe-parts]').innerHTML=match.parts.map(part=>recipeRow({...part,grams:Number(part.grams.toPrecision(10))})).join('');
    // A copied recipe needs a fresh measurement before it can be saved as measured.
    for(const name of ['lab0','lab1','lab2'])form.elements[name].value='';
    input(form.elements.lab0);
    toast('Gramajes cargados. Registra los valores de la nueva muestra cuando la midas.');
   }
   return true;
  }
  return false;
 }
 function input(field){
  const form=field.form;
  if(form?.dataset.lab!=='recipe')return;
  query(form,'.result').hidden=true;
  query(form,'[data-finish-detail]').hidden=form.elements.finish.value==='Sin recubrimiento';
  if(['ink','grams'].includes(field.name))return;
  const proposals=query(form,'[data-lab-proposals]');
  proposals.hidden=true;pending.delete(proposals);
  const host=query(form,'[data-lab-preview]'), values=dataOf(form);
  host.innerHTML='';
  try{
   const lab=recipeLab(values);
   if(!lab)return;
   const color=displayLab(lab,values.light+' / '+values.observer);
   host.innerHTML=color?'<div class="comparison"><span style="--ink:'+color.hex+'"></span></div><small>Muestra aproximada en pantalla'+(color.clipped?' · con recorte de gama':'')+'</small>':
    '<small>Vista sRGB disponible para D50 y D65 con observador de 2°.</small>';
  }catch{}
 }
 return {views,submit,click,change,input};
}
