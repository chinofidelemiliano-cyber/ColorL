import {context, corrections, diagnostic, formulations, linkInventory, lotCost, mixture, normalize, positive, processFields, readLab, spectrum, symptoms, technologies} from './lab-model.js';
import {encodeFile,extractCatalog} from './catalog-import.js';

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
 const trials=()=>[...own('caracterizaciones'),...own('correcciones')].map(record=>({
  ...record,approvedFormula:approved().find(formula=>formula.id===record.value.formulaId)
 }));
 const measures=()=>own('mediciones');
 const approved=()=>own('formulas').filter(r=>['Aprobada','Compartida'].includes(r.status));
 const options=(name,label,records,required=false)=>'<label class="field">'+esc(label)+'<select name="'+name+'" '+(required?'required':'')+'><option value="">Seleccionar</option>'+records.map(r=>'<option value="'+r.id+'">'+esc(r.title)+'</option>').join('')+'</select></label>';
 const conditions=()=>field('technology','Tecnología',technologies)+field('substrate','Sustrato y tratamiento','text','',true)+
  options('aniloxRecord','Anilox de mi inventario',own('anilox').filter(r=>Number(r.value.real)>0))+
  field('anilox','Código de anilox','text','',true)+field('bcm','Aporte real medido (BCM)','number','',true)+
  field('condition','Condición de medición',['M0','M1','M2','M3'],'M1')+field('illuminant','Iluminante y observador','text','D50 / 2°',true)+
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
 const sessions=()=>own('correcciones').filter(r=>r.value.targetLab&&r.value.conditions&&Array.isArray(r.value.parts));
 function afterParts(parts,additions=[]){
  const amounts=new Map(parts.map(p=>[p.id,p.grams]));
  for(const part of additions)amounts.set(part.id,(amounts.get(part.id)||0)+part.grams);
  return [...amounts].map(([id,grams])=>codeFor(id)+': '+grams).join('\n');
 }
 const number=n=>Number(n).toFixed(3);
 const partsTable=parts=>'<ol class="lab-list">'+parts.map(part=>'<li><strong>'+esc(codeFor(part.id))+' · '+esc(nameFor(part.id))+'</strong> — '+number(part.grams)+' g ('+Number(part.grams/1000).toFixed(6)+' kg)'+(part.percent==null?'':' · '+number(part.percent)+' %')+(part.difference==null?'':' · cambio '+(part.difference>=0?'+':'')+number(part.difference)+' g')+'</li>').join('')+'</ol>';
 function spectralComparison(curves){
  const valid=curves.filter(([,points])=>points.length>1);
  if(!valid.length)return '';
  const x=nm=>32+(nm-360)*500/470,y=percent=>120-percent;
  const colors=['var(--cyan)','var(--pink)','#a68aff'];
  return '<figure class="lab-spectrum"><svg viewBox="0 0 550 147" role="img" aria-label="Reflectancia espectral en porcentaje por longitud de onda"><path d="M32 20V120H532" fill="none" stroke="currentColor"/>'+
   '<text x="2" y="25" fill="currentColor">100</text><text x="15" y="122" fill="currentColor">0</text><text x="32" y="139" fill="currentColor">360 nm</text><text x="485" y="139" fill="currentColor">830 nm</text>'+
   valid.map(([,points],i)=>'<polyline fill="none" stroke="'+colors[i]+'" stroke-width="2" points="'+points.map(([nm,pct])=>x(nm)+','+y(pct)).join(' ')+'"/>').join('')+
   '</svg><figcaption>'+valid.map(([name],i)=>'<span style="color:'+colors[i]+'">'+name+'</span>').join('')+'</figcaption></figure>';
 }
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
 const labInput=(key,label)=>field(key,label);
 const targetFields=()=>options('pattern','Patrón guardado',own('colores'))+field('format','Formato de los valores',['CIELAB','CIELCh'])+
  labInput('target','Patrón manual (tres valores, separados por comas)')+field('tolerance','Tolerancia ΔE 2000','number',2,true);
 views.igualacion=()=>heading('Igualación inteligente','Compara ensayos verificados de tu catálogo, evalúa correcciones y documenta cada medición.')+
  '<details class="panel lab-detail" open><summary>Proponer fórmula</summary><form data-lab="formula"><div class="form-grid">'+targetFields()+conditions()+field('batch','Cantidad a preparar (g)','number','',true)+'</div><div class="form-actions"><button class="primary">Buscar fórmulas ensayadas</button></div>'+output+'</form></details>'+
  '<details class="panel lab-detail"><summary>Corregir una muestra</summary><form data-lab="correction"><div class="form-grid">'+targetFields()+conditions()+
  options('measurement','Medición inicial guardada',measures())+labInput('current','Muestra manual (tres valores)')+field('reported','ΔE informado por el instrumento (opcional)','number')+
  field('parts','Mezcla actual en orden (un código: gramos por línea)','textarea','',true)+
  field('targetReflectance','Reflectancia del patrón (%), una línea nm, porcentaje','textarea')+field('reflectance','Reflectancia inicial (%), una línea nm, porcentaje','textarea')+'</div><div class="form-actions"><button class="primary">Evaluar desviación</button></div>'+output+'</form></details>'+
  '<details class="panel lab-detail"><summary>Diagnóstico fisicoquímico</summary><form data-lab="diagnostic"><div class="form-grid">'+
  field('application','Propiedad',symptoms)+field('direction','Objetivo (tal como figura en la ficha)','text','',true)+field('technology','Tecnología',technologies)+
  field('family','Familia exacta de la tinta','text','',true)+field('substrate','Sustrato exacto','text','',true)+field('batch','Masa del lote (g)','number','',true)+'</div><div class="form-actions"><button class="primary">Buscar productos documentados</button></div>'+output+'</form></details>'+
  '<div class="section-head"><h2>Sesiones de igualación</h2></div><section class="panel" id="lab-sessions">'+sessionRows()+'</section>';
 function sessionRows(){
  return sessions().map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>ΔE₀₀ '+Number(r.value.delta).toFixed(2)+' · '+esc(r.value.conditions.substrate)+'</small></div>'+
   btn('Ver resultado','data-lab-session="'+r.id+'"','','text-button')+'</div>').join('')||blank('Tus mediciones de seguimiento aparecerán aquí.');
 }
 function updateSessions(){
  const section=document.querySelector('#lab-sessions');
  if(section)section.innerHTML=sessionRows();
 }
 function target(input){
  const pattern=own('colores').find(r=>r.id===Number(input.pattern));
  return pattern ? readLab(pattern.value.lab,'CIELAB') : readLab(input.target,input.format);
 }
 function showFormulas(form,input){
  const color=target(input),ctx=context(input),batch=positive(input.batch,'El tamaño del lote'), tolerance=positive(input.tolerance,'La tolerancia');
  const eligible=available();
  const candidates=formulations(trials(),eligible,{target:color,conditions:ctx,batch},delta)
   .map(candidate=>({...candidate,cost:lotCost(candidate.parts,eligible)}));
  pending.set(form,{candidates,input,ctx,batch});
  result(form,candidates.length?candidates.map(({record,parts,delta:distance,best,count,cost},index)=>'<section class="lab-candidate"><h3>'+esc(record.title)+'</h3><p>ΔE₀₀ '+(count===1?'del ensayo '+distance.toFixed(2):'observado '+best.toFixed(2)+'–'+distance.toFixed(2)+' en '+count+' ensayos')+' · '+(distance<=tolerance?'Dentro de tolerancia en las pruebas':'Requiere una nueva prueba')+'</p>'+
  '<p>Confianza '+(distance<=tolerance?(count>1?'moderada, con repetición':'moderada, con una prueba'):'baja')+'. Selección por cercanía medida y coincidencia de sustrato, anilox, BCM y condiciones. Prepara primero una muestra pequeña en este orden. Mídela con el mismo sustrato, anilox, iluminante y condición antes de escalar.</p>'+partsTable(parts)+
  (cost?'<p>Costo estimado por lotes de vencimiento más cercano: '+esc(cost.currency)+' '+cost.amount.toFixed(2)+'</p>':'')+
  (record.approvedFormula?'<p>Fórmula aprobada relacionada: '+esc(record.approvedFormula.title)+'</p>':'')+
  (record.value.notes?'<p>'+esc(record.value.notes)+'</p>':'')+btn('Guardar como fórmula','data-lab-formula="'+index+'"','','primary')+'</section>').join('')+
  blank('Cada opción es una mezcla completa ensayada con las tintas disponibles. Si falta un componente, exclúyelo del catálogo para buscar otras mezclas verificadas.'):
  blank('No hay mezclas verificadas con esas condiciones y tintas disponibles. Registra un ensayo compatible para obtener gramajes.'));
 }
 function showCorrection(form,input){
  const color=target(input),ctx=context(input),tolerance=positive(input.tolerance,'La tolerancia'), reported=input.reported===''||input.reported==null?null:Number(input.reported);
  if(reported!==null&&(!Number.isFinite(reported)||reported<0))throw new Error('El ΔE del instrumento debe ser positivo o cero.');
  const reading=measures().find(r=>r.id===Number(input.measurement));
  if(reading&&(normalize(reading.value.condition)!==normalize(ctx.condition)||normalize(reading.value.illuminant)!==normalize(ctx.illuminant)))throw new Error('Selecciona las mismas condiciones de medición que tiene el registro guardado.');
  const current=reading?.value.sample||readLab(input.current,input.format), parts=mixture(input.parts,inks()), beforeSpectrum=spectrum(input.reflectance);
  const savedPattern=own('colores').find(r=>r.id===Number(input.pattern));
  const targetCurve=spectrum(input.targetReflectance||savedPattern?.value.spectrum);
  const baseline=delta(color,current), diffs=current.map((n,i)=>n-color[i]);
  const candidates=baseline<=tolerance?[]:corrections(trials(),inks(),{target:color,current,conditions:ctx,parts},delta);
  pending.set(form,{candidates,input,ctx,color,current,parts,beforeSpectrum,targetCurve,reported,tolerance});
  result(form,'<strong>ΔE₀₀ actual '+baseline.toFixed(2)+' · '+(baseline<=tolerance?'Dentro de tolerancia':'Fuera de tolerancia')+'</strong><p>ΔL* '+diffs[0].toFixed(2)+' · Δa* '+diffs[1].toFixed(2)+' · Δb* '+diffs[2].toFixed(2)+
   '</p><p>'+['luminosidad','eje verde–rojo','eje azul–amarillo'].map((label,i)=>esc(label)+': '+(Math.abs(diffs[i])<.005?'sin desviación relevante':[['más oscura','más clara'],['más verde','más roja'],['más azul','más amarilla']][i][Number(diffs[i]>0)])).join(' · ')+'</p>'+
   spectralComparison([['Patrón',targetCurve],['Muestra',beforeSpectrum]])+
   (reported!==null?'<p>ΔE informado por el instrumento: '+esc(reported)+'. La comparación utiliza ΔE₀₀ calculado.</p>':'')+
   (baseline<=tolerance?blank('Guarda la medición como resultado dentro de tolerancia.')+btn('Guardar resultado','data-lab-accept'):
    candidates.length?candidates.map(({record,score,add,reduced},index)=>'<section class="lab-candidate"><h3>'+esc(record.title)+'</h3><p>ΔE₀₀ estimado '+score.toFixed(2)+' · dosis observada en ensayo con las mismas proporciones y condiciones. Valida primero en una muestra.</p><strong>Agregar a la mezcla en este orden</strong>'+partsTable(add)+'<strong>Si rehaces el lote desde cero con la misma masa</strong>'+partsTable(reduced)+btn('Registrar nueva medición','data-lab-follow="'+index+'"','','primary')+'</section>').join(''):
    blank('No hay una corrección verificada que mejore este color para esta composición y condiciones. Registra los resultados de una prueba controlada para ampliar la evidencia.')+btn('Registrar ajuste ensayado','data-lab-manual')));
 }
 function followUp(host,index){
  const session=pending.get(host), candidate=session?.candidates[index];
  if(!session || (index!=null&&!candidate))throw new Error('Vuelve a evaluar la desviación.');
  modal('Nueva medición después del ajuste','<form data-lab="follow"><div class="form-grid">'+field('format','Formato de la medición',['CIELAB','CIELCh'])+field('after','Valores medidos después del ajuste','text','',true)+
   field('additions','Gramos realmente agregados (un código: gramos por línea)','textarea',(candidate?.add||[]).map(p=>codeFor(p.id)+': '+p.grams.toFixed(6)).join('\n'),true)+
   field('reflectance','Reflectancia final (%), una línea nm, porcentaje','textarea')+field('notes','Observaciones','textarea')+
   field('verified','Confirmo que apliqué y medí este ajuste en las mismas condiciones','checkbox')+'</div><div class="form-actions"><button class="primary">Guardar y reevaluar</button></div>'+output+'</form>');
  pending.set(document.querySelector('[data-lab=follow]'),{session,host,candidate});
 }
 async function submit(form){
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
   case 'formula':showFormulas(form,input);return;
   case 'correction':showCorrection(form,input);return;
   case 'diagnostic':{
    const products=diagnostic(available(),input);
    result(form,products.length?products.map(({ink,min,max,minGrams,maxGrams})=>'<section class="lab-candidate"><h3>'+esc(ink.title)+'</h3><p>Intervalo de ficha: '+number(min)+'–'+number(max)+' % · '+number(minGrams)+'–'+number(maxGrams)+' g sobre la masa inicial.</p><p><strong>Procedimiento y fundamento</strong> '+esc(ink.value.procedure)+'</p><p><strong>Riesgos y verificación</strong> '+esc(ink.value.risks)+'</p><p><strong>Fuente</strong> '+esc(ink.value.reference)+'</p></section>').join('')+
    blank('El intervalo procede de la ficha registrada. Verifica las condiciones del fabricante y realiza una prueba controlada antes de ajustar el lote.'):
    blank('No se encontró un producto disponible con compatibilidad, objetivo y dosificación documentados para estas condiciones.'));return;
   }
   case 'follow':{
    const {session,host,candidate}=pending.get(form),after=readLab(input.after,input.format),additions=mixture(input.additions,available()),reflectance=spectrum(input.reflectance);
    if(additions.some(part=>normalize(inks().find(r=>r.id===part.id)?.value.technology)!==normalize(session.ctx.technology)))throw new Error('Verifica que las tintas agregadas correspondan a la tecnología de la mezcla.');
    const distance=delta(session.color,after);
    await persist({kind:'correcciones',title:candidate?'Igualación · '+candidate.record.title:'Igualación · ajuste de prueba',status:'Registrada',value:{
     mode:'ajuste',conditions:session.ctx,parts:session.parts,additions,before:session.current,after,delta:distance,tolerance:session.tolerance,targetLab:session.color,
     beforeSpectrum:session.beforeSpectrum,targetSpectrum:session.targetCurve,reflectance,reported:session.reported,notes:input.notes,evidenceId:candidate?.record.id??null,verified:input.verified==='on'
    }});
    const next={...session.input,format:'CIELAB',measurement:'',current:after.join(', '),target:session.color.join(', '),reported:'',
     parts:afterParts(session.parts,additions),reflectance:reflectance.map(p=>p.join(', ')).join('\n')};
    for(const name of ['format','measurement','current','target','reported','parts','reflectance'])host.elements.namedItem(name).value=next[name];
    document.querySelector('#dialog').close();showCorrection(host,next);updateSessions();toast('Medición guardada · ΔE₀₀ '+distance.toFixed(2));return;
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
  if(d.labFormula!==undefined){
   const {candidates,input,ctx,batch}=pending.get(button.closest('form')),candidate=candidates[Number(d.labFormula)];
   await persist({kind:'formulas',title:'Propuesta · '+candidate.record.title,status:'Borrador',value:{
    target:own('colores').find(r=>r.id===Number(input.pattern))?.title||input.target,technology:ctx.technology,substrate:ctx.substrate,anilox:ctx.anilox+' · '+ctx.bcm+' BCM',batch:String(batch),processConditions:ctx,
    components:candidate.parts.map(p=>codeFor(p.id)+': '+p.percent.toFixed(6)).join('\n'),
    notes:'A partir del ensayo '+candidate.record.title+'. ΔE₀₀ del ensayo '+candidate.delta.toFixed(2)+'.\n'+(candidate.record.value.notes||''),evidenceId:candidate?.record.id??null,modeledDelta:candidate.delta,estimatedCost:candidate.cost}});
   toast('Fórmula guardada como borrador');return true;
  }
  if(d.labSession){
   const r=sessions().find(record=>record.id===Number(d.labSession));if(!r)return true;
   const v=r.value;
   modal(r.title,blank('Patrón CIELAB: '+v.targetLab.join(', '))+(v.before?blank('Muestra inicial: '+v.before.join(', ')):'')+
    blank('Muestra final CIELAB: '+v.after.join(', ')+' · ΔE₀₀ '+Number(v.delta).toFixed(2)+' · tolerancia '+v.tolerance)+
    '<h3>Composición inicial</h3>'+partsTable(v.parts)+(v.additions?.length?'<h3>Adiciones reales</h3>'+partsTable(v.additions):'')+
    spectralComparison([['Patrón',v.targetSpectrum||[]],['Muestra inicial',v.beforeSpectrum||[]],['Muestra final',v.reflectance||[]]])+
    blank(v.notes)+(editable()&&v.delta>v.tolerance?btn('Reanudar igualación','data-lab-resume="'+r.id+'"','','primary'):''));
   return true;
  }
  if(d.labResume){
   const r=sessions().find(record=>record.id===Number(d.labResume));if(!r)return true;
   const v=r.value,form=document.querySelector('[data-lab=correction]');
   const input={...v.conditions,pattern:'',measurement:'',format:'CIELAB',target:v.targetLab.join(', '),current:v.after.join(', '),tolerance:v.tolerance,reported:'',
    parts:afterParts(v.parts,v.additions),targetReflectance:(v.targetSpectrum||[]).map(p=>p.join(', ')).join('\n'),reflectance:(v.reflectance||[]).map(p=>p.join(', ')).join('\n')};
   for(const [name,value] of Object.entries(input)){const element=form.elements.namedItem(name);if(element)element.value=value;}
   form.closest('details').open=true;
   document.querySelector('#dialog').close();showCorrection(form,input);form.scrollIntoView({block:'start'});return true;
  }
  if(d.labManual!==undefined){followUp(button.closest('form'),null);return true;}
  if(d.labFollow!==undefined){followUp(button.closest('form'),Number(d.labFollow));return true;}
  if(d.labAccept!==undefined){
   const session=pending.get(button.closest('form'));
   await persist({kind:'correcciones',title:'Igualación dentro de tolerancia',status:'Registrada',value:{
    after:session.current,targetLab:session.color,conditions:session.ctx,parts:session.parts,delta:delta(session.color,session.current),tolerance:session.tolerance,
    reflectance:session.beforeSpectrum,targetSpectrum:session.targetCurve,reported:session.reported,verified:false}});
   updateSessions();button.dataset.saved='true';toast('Resultado guardado');return true;
  }
  return false;
 }
 return {views,submit,click,change};
}
