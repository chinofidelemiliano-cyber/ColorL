import {checkStates,defectNames,diagnosis,evaluatePress,pressChecks} from './press-diagnosis.js';
import {sameMeasurement} from './color-standards.js';
import {displayLab} from './instrument.js';
import {context, corrections, diagnostic, formulations, linkInventory, lotCost, mixture, normalize, positive, processFields, readLab, scale, spectrum, symptoms, technologies} from './lab-model.js';
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
  ...record,approvedFormula:approved().find(formula=>formula.id===record.value.formulaId||formula.value.evidenceId===record.id)
 }));
 const measures=()=>own('mediciones');
 const approved=()=>own('formulas').filter(r=>['Aprobada','Compartida'].includes(r.status));
 const options=(name,label,records,required=false)=>'<label class="field">'+esc(label)+'<select name="'+name+'" '+(required?'required':'')+'><option value="">Seleccionar</option>'+records.map(r=>'<option value="'+r.id+'">'+esc(r.title)+'</option>').join('')+'</select></label>';
 const conditions=()=>field('technology','Tecnología',technologies)+field('substrate','Sustrato y tratamiento','text','',true)+
  options('aniloxRecord','Anilox de mi inventario',own('anilox').filter(r=>Number(r.value.real)>0))+
  field('anilox','Código de anilox','text','',true)+field('bcm','Aporte real medido (BCM)','number','',true)+
  field('condition','Condición de medición',['M0','M1','M2','M3'],'M1')+field('illuminant','Iluminante y observador','text','D50 / 2°',true).replace('name="illuminant"','name="illuminant" list="lab-measure-lights"')+
  '<datalist id="lab-measure-lights">'+['D50','D65','D55','D75','A','F2','F11'].flatMap(light=>['2°','10°'].map(observer=>'<option value="'+light+' / '+observer+'">')).join('')+'</datalist>'+
  '<details class="wide"><summary>Condiciones adicionales de impresión</summary><div class="form-grid">'+processFields.map(([key,label,type])=>field(key,label,type)).join('')+'</div></details>';
 function change(field){
  if(field.name==='pattern'&&field.form?.classList.contains('pantone-workflow')){
   const v=own('colores').find(r=>r.id===Number(field.value))?.value;
   if(v?.illuminant&&v.observer&&v.condition){
    for(const [name,value] of Object.entries({illuminant:v.illuminant+' / '+v.observer,condition:v.condition,geometry:v.geometry,backing:v.backing,tolerance:v.tolerance}))
     if(value!=null&&value!=='')field.form.elements.namedItem(name).value=value;
   }
  }
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
 const pressFields=()=>'<details class="wide" open><summary>Verificación antes de dosificar</summary>'+blank('Compara estas comprobaciones con una prueba aprobada. Indica qué lectura o ficha usaste como referencia.')+
  '<div class="form-grid">'+pressChecks.map(([key,label])=>field(key,label,checkStates)).join('')+
  field('pressEvidence','Referencia de prensa, banco de prueba y verificación','textarea')+'</div></details>';
 const previewColors=(values,illuminant,names)=>{
  const colors=values.map(lab=>displayLab(lab,illuminant));
  return colors.every(Boolean)?'<div class="comparison">'+colors.map((color,i)=>'<span title="'+esc(names[i])+'" style="--ink:'+color.hex+'"></span>').join('')+
   '</div><small>'+esc(names.join(' · '))+' · sRGB aproximado'+(colors.some(color=>color.clipped)?' · con recorte de gama':'')+'</small>':'<small>Vista sRGB disponible para D50 o D65 con observador de 2°. El gráfico cromático conserva los valores medidos.</small>';
 };
 const directions=(target,sample)=>{
  const c=lab=>Math.hypot(lab[1],lab[2]);
  return [[target[0]-sample[0],'disminuye la luminosidad','incrementa la luminosidad'],
   [target[1]-sample[1],'desplaza hacia verde','desplaza hacia rojo'],
   [target[2]-sample[2],'desplaza hacia azul','desplaza hacia amarillo'],
   [c(target)-c(sample),'reduce el croma','incrementa el croma']]
   .filter(([difference])=>Math.abs(difference)>=.01).map(([difference,negative,positive])=>difference<0?negative:positive);
 };
 const targetFields=()=>options('pattern','Patrón guardado',own('colores'))+field('format','Formato de los valores',['CIELAB','CIELCh'])+
  labInput('target','Patrón manual (tres valores, separados por comas)')+field('tolerance','Tolerancia ΔE 2000','number',2,true);
 const workflowView=()=>'<form class="panel pantone-workflow" data-lab="correction">'+
  '<h2>1. Color objetivo</h2><div class="form-grid">'+field('title','Nombre o código del color')+targetFields()+'</div>'+
  '<div data-lab-preview></div><h2>2. Condiciones y fórmula</h2><div class="form-grid">'+conditions()+
  field('batch','Cantidad a preparar (g)','number')+field('exclude','Excluir códigos de tinta (separados por comas)')+'</div>'+
  '<div class="form-actions"><button type="submit" name="action" value="formula">Buscar fórmulas ensayadas</button></div><div data-lab-proposals hidden></div>'+
  '<div class="form-grid">'+field('parts','Composición realmente pesada (un código: gramos por línea)','textarea')+'</div>'+
  '<h2>3. Medir y corregir</h2><div class="form-grid">'+
  options('measurement','Medición guardada',measures())+field('sampleFormat','Formato de la muestra',['CIELAB','CIELCh'])+labInput('current','Muestra manual (tres valores)')+
  field('reported','ΔE informado por el instrumento (opcional)','number')+
  '<details class="wide"><summary>Reflectancia del patrón y de la muestra</summary><div class="form-grid">'+
  field('targetReflectance','Reflectancia del patrón (%), una línea nm, porcentaje','textarea')+field('reflectance','Reflectancia de la muestra (%), una línea nm, porcentaje','textarea')+
  '</div></details>'+pressFields()+field('verifyFinal','Confirmo que pesé y medí esta mezcla en las condiciones registradas','checkbox')+'</div><div class="form-actions"><button class="primary" name="action" value="correction">Comparar y evaluar corrección</button></div>'+output+
  '</form><section class="panel" id="lab-inline-follow" hidden></section><section class="panel" id="lab-run-history"><h2>4. Historial de pruebas</h2></section>';
 views.igualacion=()=>heading('Nueva fórmula de Pantone','Registra el objetivo, formula con tus tintas, compara las pruebas y conserva la mezcla final.',btn('Iniciar otra igualación','data-lab-new','plus'))+
  workflowView()+
  '<details class="panel lab-detail"><summary>Diagnóstico de impresión</summary><form data-lab="defect"><div class="form-grid">'+
  field('defect','Síntoma observado',defectNames)+'</div><div class="form-actions"><button class="primary">Consultar procedimiento</button></div>'+output+'</form></details>'+
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
 function preview(form){
  const host=query(form,'[data-lab-preview]');
  if(!host)return;
  const input=dataOf(form);
  let color,sample;
  try{color=target(input);}catch{host.innerHTML='';return;}
  try{sample=measures().find(r=>r.id===Number(input.measurement))?.value.sample||(input.current?.trim()?readLab(input.current,input.sampleFormat):null);}catch{}
  const readings=[['Objetivo',color],...(sample?[['Muestra',sample]]:[])];
  const radial=Math.max(100,...readings.map(([,lab])=>Math.hypot(lab[1],lab[2])));
  host.innerHTML='<div class="pantone-preview"><div class="pantone-wheel" role="img" aria-label="Círculo cromático con posición por tonalidad y croma">'+
   readings.map(([label,lab])=>'<span title="'+label+'" style="left:'+(50+46*lab[1]/radial)+'%;top:'+(50-46*lab[2]/radial)+'%">'+label[0]+'</span>').join('')+
   '</div><div>'+previewColors(readings.map(([,lab])=>lab),input.illuminant,readings.map(([label])=>label)) +
   readings.map(([label,[l,a,b]])=>{
    const c=Math.hypot(a,b),h=(Math.atan2(b,a)*180/Math.PI+360)%360;
    return '<p><strong>'+label+'</strong> · L* '+l.toFixed(2)+' · C* '+c.toFixed(2)+' · h° '+(c<.01?'indefinido':h.toFixed(1)+'°')+'</p>';
   }).join('')+'</div></div>';
 }
 function hueDifference([,a,b],[,x,y]){
  if(Math.min(Math.hypot(a,b),Math.hypot(x,y))<.01)return 'indefinido';
  const rotation=(Math.atan2(y,x)-Math.atan2(b,a))*180/Math.PI;
  return (((rotation+540)%360)-180).toFixed(1)+'°';
 }
 const runs=new WeakMap();
 const runFor=form=>{
  if(!runs.has(form))runs.set(form,{id:crypto.randomUUID(),formulaId:null});
  return runs.get(form);
 };
 function runHistory(form){
  const host=document.querySelector('#lab-run-history');
  const rows=sessions().filter(row=>row.value.workflowId===runFor(form).id).sort((a,b)=>a.id-b.id);
  host.innerHTML='<h2>4. Historial de pruebas</h2>'+(rows.length?'<ol>'+rows.map(({id,value:v},i)=>{
   const change=i?v.delta-rows[i-1].value.delta:0;
   return '<li><strong>Prueba '+(i+1)+' · ΔE₀₀ '+v.delta.toFixed(2)+'</strong> · '+(v.delta<=v.tolerance?'Dentro de tolerancia':'Fuera de tolerancia')+
    (i?' · '+(Math.abs(change)<.005?'sin cambio apreciable':(change<0?'se acercó ':'se alejó ')+Math.abs(change).toFixed(2)):'')+
    (v.additions?.length?partsTable(v.additions):'')+' '+btn('Ver medición','data-lab-session="'+id+'"','','text-button')+'</li>';
  }).join('')+'</ol>':blank('Guarda la primera medición para seguir la evolución del ΔE₀₀.'));
 }
 function checkPattern(input,ctx){
  const pattern=own('colores').find(r=>r.id===Number(input.pattern))?.value;
  if(!pattern)return;
  const [illuminant,observer]=ctx.illuminant.split(/\s*\/\s*/);
  if(!sameMeasurement(pattern,{...ctx,illuminant,observer})||
     ['geometry','backing'].some(key=>pattern[key]&&normalize(pattern[key])!==normalize(ctx[key])))
   throw new Error('Usa el iluminante, observador, condición, geometría y fondo registrados para el patrón. Si es un patrón antiguo sin condiciones, vuelve a capturar los valores del instrumento.');
 }
 function showFormulas(form,input){
  const color=target(input),ctx=context(input),batch=positive(input.batch,'El tamaño del lote'), tolerance=positive(input.tolerance,'La tolerancia');
  checkPattern(input,ctx);
  const excluded=String(input.exclude||'').split(/[,;]+/).map(normalize).filter(Boolean);
  const eligible=available().filter(ink=>!excluded.includes(normalize(ink.value.code)));
  const candidates=formulations(trials(),eligible,{target:color,conditions:ctx,batch,tolerance},delta)
   .map(candidate=>({...candidate,cost:lotCost(candidate.parts,eligible)}));
  const proposals=query(form,'[data-lab-proposals]');
  pending.set(proposals,{candidates,input,ctx,batch});
  proposals.hidden=false;proposals.innerHTML=candidates.length?candidates.map(({record,parts,delta:distance,best,count,cost},index)=>'<section class="lab-candidate"><h3>'+esc(record.title)+'</h3><p>ΔE₀₀ '+(count===1?'del ensayo '+distance.toFixed(2):'observado '+best.toFixed(2)+'–'+distance.toFixed(2)+' en '+count+' ensayos')+' · '+(distance<=tolerance?'Dentro de tolerancia en las pruebas':'Requiere una nueva prueba')+'</p>'+
  '<p>Confianza '+(distance<=tolerance?(count>1?'moderada, con repetición':'moderada, con una prueba'):'baja')+'. Selección por cercanía medida y coincidencia de sustrato, anilox, BCM y condiciones. Prepara primero una muestra pequeña en este orden. Mídela con el mismo sustrato, anilox, iluminante y condición antes de escalar.</p>'+partsTable(parts)+
  (cost?'<p>Costo estimado por lotes de vencimiento más cercano: '+esc(cost.currency)+' '+cost.amount.toFixed(2)+'</p>':'')+
  (record.approvedFormula?'<p>Fórmula aprobada relacionada: '+esc(record.approvedFormula.title)+'</p>':'')+
  (record.value.notes?'<p>'+esc(record.value.notes)+'</p>':'')+btn('Usar como punto de partida','data-lab-use="'+index+'"','','primary')+'</section>').join('')+
  blank('Cada opción es una mezcla completa ensayada con las tintas disponibles. Si falta un componente, exclúyelo del catálogo para buscar otras mezclas verificadas.'):
  blank('No hay mezclas verificadas con esas condiciones y tintas disponibles. Registra un ensayo compatible para obtener gramajes.');
 }
 function showCorrection(form,input){
  const color=target(input),ctx=context(input),tolerance=positive(input.tolerance,'La tolerancia'), reported=input.reported===''||input.reported==null?null:Number(input.reported);
  checkPattern(input,ctx);
  if(reported!==null&&(!Number.isFinite(reported)||reported<0))throw new Error('El ΔE del instrumento debe ser positivo o cero.');
  const reading=measures().find(r=>r.id===Number(input.measurement));
  if(reading&&(normalize(reading.value.condition)!==normalize(ctx.condition)||normalize(reading.value.illuminant)!==normalize(ctx.illuminant)||['geometry','backing'].some(key=>normalize(reading.value[key])!==normalize(ctx[key]))))throw new Error('Selecciona las mismas condiciones, geometría y fondo de la medición guardada.');
  const current=reading?.value.sample||readLab(input.current,input.sampleFormat||input.format), parts=input.parts?.trim()?mixture(input.parts,inks()):[], beforeSpectrum=spectrum(input.reflectance);
  const savedPattern=own('colores').find(r=>r.id===Number(input.pattern));
  const targetCurve=spectrum(input.targetReflectance||savedPattern?.value.spectrum);
  const baseline=delta(color,current), diffs=current.map((n,i)=>n-color[i]), press=evaluatePress(input);
  const candidates=baseline<=tolerance||!press.ready||!parts.length?[]:corrections(trials(),inks(),{target:color,current,conditions:ctx,parts},delta);
  const run=runFor(form);
  const signature=JSON.stringify([color,...['technology','substrate','anilox','bcm','condition','illuminant',...processFields.map(([key])=>key)].map(key=>ctx[key]),tolerance]);
  if(run.signature&&run.signature!==signature){
   runs.delete(form);
   toast('Nuevo objetivo o condiciones. Las pruebas anteriores conservan su propio historial.');
  }
  runFor(form).signature=signature;
  pending.set(form,{candidates,input,ctx,color,current,parts,beforeSpectrum,targetCurve,reported,tolerance,press});
  runHistory(form);preview(form);
  result(form,'<strong>ΔE₀₀ actual '+baseline.toFixed(2)+' · '+(baseline<=tolerance?'Dentro de tolerancia':'Fuera de tolerancia')+'</strong><p>ΔL* '+diffs[0].toFixed(2)+' · Δa* '+diffs[1].toFixed(2)+' · Δb* '+diffs[2].toFixed(2)+
   '</p><p>'+['luminosidad','eje verde–rojo','eje azul–amarillo'].map((label,i)=>esc(label)+': '+(Math.abs(diffs[i])<.005?'sin desviación relevante':[['más oscura','más clara'],['más verde','más roja'],['más azul','más amarilla']][i][Number(diffs[i]>0)])).join(' · ')+'</p>'+
   '<p>Δh° '+hueDifference(color,current)+' · ΔC* '+(Math.hypot(current[1],current[2])-Math.hypot(color[1],color[2])).toFixed(2)+' · objetivo ≤ '+tolerance+' ΔE₀₀</p>'+
   (parts.length?'<h3>Composición actual</h3>'+partsTable(scale(parts,parts.reduce((sum,p)=>sum+p.grams,0))):blank('Registra los gramajes reales para evaluar una dosis y guardar la fórmula.'))+
   '<div class="form-actions">'+btn('Guardar esta prueba','data-lab-accept')+
   (parts.length?btn('Guardar fórmula final','data-lab-final','','primary'):'')+'</div>'+
   (baseline>tolerance?blank('Dirección objetivo: '+(directions(color,current).join('; ')||'revisa la lectura')+'.'):'')+
   spectralComparison([['Patrón',targetCurve],['Muestra',beforeSpectrum]])+
   (reported!==null?'<p>ΔE informado por el instrumento: '+esc(reported)+'. La comparación utiliza ΔE₀₀ calculado.</p>':'')+
   (baseline<=tolerance?blank('La muestra cumple la tolerancia registrada.'):
    !press.ready?'<h3>'+esc(press.failed.length?'Corrige primero las condiciones de prensa':'Completa la verificación antes de dosificar')+'</h3>'+
    '<ul>'+[...press.failed,...press.missing].map(([,label,instruction])=>'<li><strong>'+esc(label)+'</strong> '+esc(instruction)+'</li>').join('')+'</ul>'+
    (!press.evidence?blank('Anota el documento o la lectura que usaste como referencia.'):'')+
    blank('Puedes guardar la comparación y repetir la medición tras corregir las condiciones de prensa.'):
    candidates.length?candidates.map(({record,score,best,worst,count,add,reduced,estimated,risks},index)=>'<section class="lab-candidate"><h3>'+esc(record.title)+'</h3>'+
    '<p>ΔE₀₀ estimado '+score.toFixed(2)+' · confianza '+(count>=2?'moderada con repetición':'baja, basada en un ensayo')+
    ' · '+count+' '+(count===1?'ensayo comparable':'ensayos comparables')+
    (count>1?' · intervalo de escenarios '+best.toFixed(2)+'–'+worst.toFixed(2):'')+'.</p>'+
    blank('La dosis escala un ajuste medido en la misma composición y condiciones. Repite primero en una muestra pequeña y verifica estabilidad, adherencia y secado o curado.')+
    (risks.length?blank('Posible deterioro adicional en '+risks.join(', ')+'. Verifica ese eje antes de escalar.'):'')+
    previewColors([color,current,estimated],ctx.illuminant,['Patrón','Muestra','Estimación'])+
    '<strong>Agregar a la mezcla en este orden (% sobre masa inicial)</strong>'+
    partsTable(add.map(part=>({...part,percent:100*part.grams/parts.reduce((sum,p)=>sum+p.grams,0)})))+'<strong>Si rehaces el lote desde cero con la misma masa</strong>'+partsTable(reduced)+
    btn('Registrar nueva medición','data-lab-follow="'+index+'"','','primary')+'</section>').join(''):
    blank('Los ensayos disponibles no respaldan una dosis que mejore el color de forma consistente. Si repetir la prueba no aporta evidencia, ensaya una reformulación en una muestra independiente.')+
    (parts.length?btn('Registrar ajuste ensayado','data-lab-manual'):'')));

 }
 function followUp(host,index){
  const session=pending.get(host), candidate=session?.candidates[index];
  if(!session?.press.ready || (index!=null&&!candidate))throw new Error('Vuelve a evaluar la desviación.');
  const inline=document.querySelector('#lab-inline-follow');
  inline.hidden=false;inline.innerHTML='<h2>Nueva medición después del ajuste</h2><form data-lab="follow"><div class="form-grid">'+field('format','Formato de la medición',['CIELAB','CIELCh'])+field('after','Valores medidos después del ajuste','text','',true)+
   field('additions','Gramos realmente agregados (un código: gramos por línea)','textarea',(candidate?.add||[]).map(p=>codeFor(p.id)+': '+p.grams.toFixed(6)).join('\n'),true)+
   field('reflectance','Reflectancia final (%), una línea nm, porcentaje','textarea')+field('notes','Observaciones','textarea')+
   field('verified','Confirmo que apliqué y medí este ajuste en las mismas condiciones','checkbox')+'</div><div class="form-actions"><button class="primary">Guardar y reevaluar</button></div>'+output+'</form>';
  pending.set(query(inline,'form'),{session,host,candidate});
  inline.scrollIntoView({block:'start'});
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
   case 'formula':showFormulas(form,input);return;
   case 'correction':if(submitter?.value==='formula')showFormulas(form,input);else showCorrection(form,input);return;
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
   case 'follow':{
    const {session,host,candidate}=pending.get(form),after=readLab(input.after,input.format),additions=mixture(input.additions,available()),reflectance=spectrum(input.reflectance);
    if(additions.some(part=>normalize(inks().find(r=>r.id===part.id)?.value.technology)!==normalize(session.ctx.technology)))throw new Error('Verifica que las tintas agregadas correspondan a la tecnología de la mezcla.');
    await saveReading(host,session);
    const distance=delta(session.color,after);
    await persist({kind:'correcciones',title:candidate?'Igualación · '+candidate.record.title:'Igualación · ajuste de prueba',status:'Registrada',value:{
     mode:'ajuste',workflowTitle:session.input.title,patternId:Number(session.input.pattern)||runFor(host).patternId||null,workflowId:runFor(host).id,conditions:session.ctx,parts:session.parts,additions,before:session.current,after,delta:distance,tolerance:session.tolerance,targetLab:session.color,
     beforeSpectrum:session.beforeSpectrum,targetSpectrum:session.targetCurve,reflectance,reported:session.reported,notes:input.notes,evidenceId:candidate?.record.id??null,pressCheck:session.press,verified:session.press.ready&&input.verified==='on'
    }});
    const next={...session.input,verifyFinal:'',sampleFormat:'CIELAB',measurement:'',current:after.join(', '),reported:'',
     parts:afterParts(session.parts,additions),reflectance:reflectance.map(p=>p.join(', ')).join('\n')};
    host.elements.verifyFinal.checked=false;
    const fields=['sampleFormat','measurement','current','reported','parts','reflectance'];
    if(input.verified!=='on'){
     for(const [key] of pressChecks){next[key]=checkStates[0];fields.push(key);}
     next.pressEvidence='';fields.push('pressEvidence');
    }
    for(const name of fields)host.elements.namedItem(name).value=next[name];
    document.querySelector('#lab-inline-follow').hidden=true;showCorrection(host,next);updateSessions();toast('Medición guardada · ΔE₀₀ '+distance.toFixed(2));return;
   }
  }
 }
 async function saveReading(form,session){
  const id=runFor(form).id;
  const last=sessions().filter(r=>r.value.workflowId===id).reduce((newest,row)=>!newest||row.id>newest.id?row:newest,null);
  if(last&&JSON.stringify(last.value.after)===JSON.stringify(session.current)&&
    afterParts(last.value.parts,last.value.additions)===afterParts(session.parts)&&
    JSON.stringify(last.value.reflectance||[])===JSON.stringify(session.beforeSpectrum))return;
   const distance=delta(session.color,session.current);
   await persist({kind:'correcciones',title:session.input.title?.trim()||'Medición de igualación',status:'Registrada',value:{
    workflowId:id,patternId:Number(session.input.pattern)||runFor(form).patternId||null,workflowTitle:session.input.title,after:session.current,targetLab:session.color,conditions:session.ctx,parts:session.parts,delta:distance,tolerance:session.tolerance,
    reflectance:session.beforeSpectrum,targetSpectrum:session.targetCurve,reported:session.reported,pressCheck:session.press,verified:false}});
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
  if(d.labNew!==undefined){
   const form=document.querySelector('.pantone-workflow');
   if(form.elements.target.value||form.elements.pattern.value||form.elements.parts.value){
    if(!confirm('¿Iniciar otra igualación? Las pruebas guardadas seguirán disponibles.'))return true;
   }
   form.reset();runs.delete(form);pending.delete(form);
   query(form,'.result').hidden=true;query(form,'[data-lab-proposals]').hidden=true;
   document.querySelector('#lab-inline-follow').hidden=true;
   preview(form);runHistory(form);form.elements.title.focus();return true;
  }
  if(d.labUse!==undefined){
   const form=button.closest('form'),candidate=pending.get(query(form,'[data-lab-proposals]'))?.candidates[Number(d.labUse)];
   if(!candidate)return true;
   form.elements.parts.value=afterParts(candidate.parts);
   form.elements.verifyFinal.checked=false;
   pending.delete(form);query(form,'.result').hidden=true;
   document.querySelector('#lab-inline-follow').hidden=true;
   form.elements.parts.focus();
   toast('Propuesta cargada. Ajusta los gramajes a lo que peses realmente.');return true;
  }
  if(d.labSession){
   const r=sessions().find(record=>record.id===Number(d.labSession));if(!r)return true;
   const v=r.value;
   modal(r.title,blank('Patrón CIELAB: '+v.targetLab.join(', '))+(v.before?blank('Muestra inicial: '+v.before.join(', ')):'')+
    blank('Muestra final CIELAB: '+v.after.join(', ')+' · ΔE₀₀ '+Number(v.delta).toFixed(2)+' · tolerancia '+v.tolerance)+
    '<h3>Composición inicial</h3>'+partsTable(v.parts)+(v.additions?.length?'<h3>Adiciones reales</h3>'+partsTable(v.additions):'')+
    spectralComparison([['Patrón',v.targetSpectrum||[]],['Muestra inicial',v.beforeSpectrum||[]],['Muestra final',v.reflectance||[]]])+
    blank(v.pressCheck?.evidence?'Verificación de prensa: '+v.pressCheck.evidence:'')+blank(v.notes)+(editable()?btn('Reanudar igualación','data-lab-resume="'+r.id+'"','','primary'):''));
   return true;
  }
  if(d.labResume){
   const r=sessions().find(record=>record.id===Number(d.labResume));if(!r)return true;
   const latest=r.value.workflowId?sessions().filter(row=>row.value.workflowId===r.value.workflowId).reduce((left,right)=>left.id>right.id?left:right):r;
   const v=latest.value,form=document.querySelector('.pantone-workflow');
   form.reset();query(form,'[data-lab-proposals]').hidden=true;document.querySelector('#lab-inline-follow').hidden=true;
   const input={...v.conditions,pattern:'',measurement:'',format:'CIELAB',target:v.targetLab.join(', '),current:v.after.join(', '),tolerance:v.tolerance,reported:'',
    parts:afterParts(v.parts,v.additions),targetReflectance:(v.targetSpectrum||[]).map(p=>p.join(', ')).join('\n'),reflectance:(v.reflectance||[]).map(p=>p.join(', ')).join('\n')};
   for(const [name,value] of Object.entries(input)){const element=form.elements.namedItem(name);if(element)element.value=value;}
   runs.set(form,{id:v.workflowId||crypto.randomUUID(),patternId:v.patternId,formulaId:own('formulas').find(f=>f.value.workflowId===v.workflowId&&v.workflowId)?.id});
   form.elements.sampleFormat.value='CIELAB';
   form.elements.title.value=v.workflowTitle||'';
   for(const [key] of pressChecks)form.elements.namedItem(key).value=checkStates[0];
   form.elements.pressEvidence.value='';
   document.querySelector('#dialog').close();showCorrection(form,input);form.scrollIntoView({block:'start'});return true;
  }
  if(d.labManual!==undefined){followUp(button.closest('form'),null);return true;}
  if(d.labFollow!==undefined){followUp(button.closest('form'),Number(d.labFollow));return true;}
  if(d.labFinal!==undefined){
   const form=button.closest('form'),session=pending.get(form),run=runFor(form);
   const {parts,color,current,ctx,tolerance,input}=session;
   const distance=delta(color,current),batch=parts.reduce((sum,p)=>sum+p.grams,0);
   await saveReading(form,session);
   const history=sessions().filter(row=>row.value.workflowId===run.id).map(row=>row.id).sort((a,b)=>a-b);
   const title=input.title?.trim()||own('colores').find(r=>r.id===Number(input.pattern))?.title||'Igualación Pantone';
   // Preserve approved records and their traceability if a session is resumed later.
   const draft=own('formulas').find(f=>f.id===run.formulaId&&f.status==='Borrador'&&
    (f.value.evidenceType!=='Experimental'||(input.verifyFinal==='on'&&f.value.history?.at(-1)===history.at(-1))));
   const canVerify=input.verifyFinal==='on'&&session.press.ready&&distance<=tolerance&&parts.every(part=>
    normalize(inks().find(r=>r.id===part.id)?.value.technology)===normalize(ctx.technology));
   if(input.verifyFinal==='on'&&!canVerify)throw new Error('Para incorporar la mezcla al aprendizaje, confirma las comprobaciones de prensa, la tecnología de las tintas y que la lectura cumple la tolerancia.');
   const evidence=canVerify&&(own('caracterizaciones').find(r=>r.value.measuredReadingId===history.at(-1))||await persist({
    kind:'caracterizaciones',title,status:'Registrada',value:{mode:'mezcla',conditions:ctx,parts,after:current,reflectance:session.beforeSpectrum,
     verified:true,measuredReadingId:history.at(-1),notes:session.press.evidence}
   }));
   const saved=await persist({...(draft?{id:draft.id}:{}),kind:'formulas',title,status:'Borrador',value:{
    workflowId:run.id,history,patternId:Number(input.pattern)||run.patternId||null,target:title,targetLab:color,finalLab:current,delta:distance,tolerance,
    technology:ctx.technology,substrate:ctx.substrate,anilox:ctx.anilox+' · '+ctx.bcm+' BCM',processConditions:ctx,batch:String(batch),
    weighedParts:parts,components:scale(parts,batch).map(p=>codeFor(p.id)+': '+p.percent.toFixed(6)).join('\n'),
    evidenceType:evidence?'Experimental':'Manual',evidenceId:evidence?.id??null,notes:'Prueba medida. ΔE₀₀ '+distance.toFixed(2)+' · '+(distance<=tolerance?'Dentro de tolerancia':'Fuera de tolerancia')
   }});
   run.formulaId=saved.id;
   updateSessions();runHistory(form);
   toast('Fórmula final guardada para revisión');return true;
  }
  if(d.labAccept!==undefined){
   const form=button.closest('form'), session=pending.get(form);
   await saveReading(form,session);
   updateSessions();runHistory(form);button.disabled=true;button.dataset.saved='true';toast('Resultado guardado');return true;
  }
  return false;
 }
 function input(field){
  const form=field.form;
  if(!form?.classList.contains('pantone-workflow'))return;
  if(['parts','current','sampleFormat','measurement','target','format','pattern'].includes(field.name))form.elements.verifyFinal.checked=false;
  pending.delete(form);query(form,'.result').hidden=true;
  const proposals=query(form,'[data-lab-proposals]');
  if(!['parts','current','sampleFormat','measurement','reported','reflectance'].includes(field.name)){
   proposals.hidden=true;pending.delete(proposals);
  }
  document.querySelector('#lab-inline-follow').hidden=true;
  preview(form);
 }
 return {views,submit,click,change,input};
}
