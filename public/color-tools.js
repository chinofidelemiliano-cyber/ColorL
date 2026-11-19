import {measurementConditions,nearestStandards,observers,parseStandardsCsv,sameMeasurement} from './color-standards.js';
import {context,linkInventory,normalize,parseLab,positive,spectrum,technologies} from './lab-model.js';
import {parseCalibration,spectralFit} from './spectral-model.js';

export function createColorTools({state,esc,field,heading,btn,modal,api,refresh,render,toast,delta,labColor}){
 const pending=new WeakMap();
 const own=kind=>state.records.filter(r=>r.owner===state.user?.id&&r.kind===kind&&r.status!=='Archivada');
 const standards=()=>own('colores');
 const inks=()=>linkInventory(own('tintas').map(row=>({...row,value:{...row.value,available:row.value.available!==false&&!row.value.inactive}})),own('inventario'));
 const notice=text=>'<p class="notice">'+esc(text)+'</p>';
 const output='<p class="error" role="alert"></p><div class="result" hidden aria-live="polite"></div>';
 const editable=()=>state.user?.fullAccess&&!['operador','estudiante'].includes(state.user.role);
 const label=record=>record.title+(record.value.target?' · '+record.value.target:record.value.code?' · '+record.value.code:'');
 function options(name,title,records,required=false){
  return '<label class="field">'+esc(title)+'<select name="'+name+'" '+(required?'required':'')+'><option value="">Seleccionar</option>'+
   records.map(record=>'<option value="'+record.id+'">'+esc(label(record))+'</option>').join('')+'</select></label>';
 }
 const measuringFields=()=>field('illuminant','Iluminante','text','D50',true)+field('observer','Observador',observers,'2°')+field('condition','Condición M',measurementConditions,'M1');
 const treatmentFields=()=>field('technology','Tecnología',technologies)+field('substrate','Sustrato y tratamiento','text','',true)+
  field('anilox','Código de anilox','text','',true)+field('bcm','BCM real medido','number','',true)+field('geometry','Geometría de medición','text','',true)+measuringFields();
 const result=(form,html)=>{
  const node=form.querySelector('.result');node.innerHTML=html;node.hidden=false;
 };
 const preview=record=>{
  const {value}=record;
  if(/^#[\da-f]{6}$/i.test(value.color||''))return value.color;
  if(value.lab&&value.illuminant==='D65'&&value.observer==='2°'){
   try{return labColor(parseLab(value.lab));}catch{return '';}
  }
  return '';
 };
 const chip=record=>{
  const color=preview(record);
  return color?'<span class="standard-chip" style="--ink:'+color+'" aria-label="Vista sRGB aproximada"></span>':'';
 };
 const action=(label,mode)=>btn(label,'data-color-tool="'+mode+'"','palette');
 function libraryActions(){
  return '<div class="form-actions lab-actions">'+action('Buscar por medición','nearest')+action('Comparar patrones','compare')+
   (editable()?action('Importar patrones CSV','import'):'')+'</div>';
 }
 function open(mode){
  if(mode==='import'&&editable())return modal('Importar patrones CSV','<form data-color-form="import">'+
   '<label class="field">Archivo CSV<input name="file" type="file" accept=".csv,text/csv" required></label>'+
   notice('Hasta 100 patrones por archivo. Usa las columnas Nombre, Código, Colección, Iluminante, Observador y Condición. Incluye Lab o L*, a*, b*. Puedes proporcionar Reflectancia como pares separados por |, además de Cliente, Producto, Trabajo, Sustrato, Tolerancia y Fuente.')+
   notice('Importa únicamente datos propios o colecciones cuya licencia te autorice a utilizar.')+
   '<div class="form-actions"><button class="primary">Revisar CSV</button></div>'+output+'</form>',true);
  if(mode==='nearest')return modal('Buscar patrones por medición','<form data-color-form="nearest"><div class="form-grid">'+
   field('lab','CIELAB (L*, a*, b*)','text','',true)+measuringFields()+field('geometry','Geometría (opcional)')+field('customer','Cliente (opcional)')+
   field('product','Producto (opcional)')+field('job','Trabajo (opcional)')+field('substrate','Sustrato (opcional)')+
   '</div><div class="form-actions"><button class="primary">Buscar por ΔE₀₀</button></div>'+output+'</form>');
  if(mode==='compare')return modal('Comparar patrones guardados','<form data-color-form="compare"><div class="form-grid">'+
   options('first','Patrón A',standards(),true)+options('second','Patrón B',standards(),true)+'</div>'+
   '<div class="form-actions"><button class="primary">Comparar</button></div>'+output+'</form>');
 }
 function spectralChart(wavelengths,series){
  const start=wavelengths[0], finish=wavelengths.at(-1), x=nm=>35+(nm-start)*480/(finish-start),y=pct=>118-pct;
  const colors=['var(--cyan)','var(--pink)','#a68aff'];
  return '<figure class="lab-spectrum"><svg viewBox="0 0 540 146" role="img" aria-label="Comparación espectral en porcentaje">'+
   '<path d="M35 18V118H515" fill="none" stroke="currentColor"/><text x="2" y="23" fill="currentColor">100</text><text x="16" y="122" fill="currentColor">0</text>'+
   '<text x="35" y="137" fill="currentColor">'+start+' nm</text><text x="475" y="137" fill="currentColor">'+finish+' nm</text>'+
   series.map(([name,values],i)=>'<polyline fill="none" stroke="'+colors[i]+'" stroke-width="2" '+(i===2?'stroke-dasharray="4 3" ':'')+
    'points="'+values.map((r,j)=>x(wavelengths[j])+','+y(r)).join(' ')+'"><title>'+esc(name)+'</title></polyline>').join('')+
   '</svg><figcaption>'+series.map(([name],i)=>'<span style="color:'+colors[i]+'">'+esc(name)+'</span>').join('')+'</figcaption></figure>';
 }
 function spectralView(){
  const curves=own('curvas'), products=inks();
  return heading('Predicción espectral','Compara concentraciones medidas e interpola dentro de una serie calibrada.')+
   '<form class="panel" data-color-form="predict"><h2>Ajuste espectral</h2><div class="form-grid">'+
   options('curve','Serie medida',curves,true)+options('pattern','Patrón espectral guardado',standards().filter(r=>r.value.spectrum))+
   field('batch','Cantidad de la mezcla (g)','number','',true)+treatmentFields()+
   field('target','Reflectancia manual del patrón (%), una línea nm, porcentaje','textarea')+'</div>'+
   '<div class="form-actions"><button class="primary">Comparar con la calibración</button></div>'+output+'</form>'+
   (editable()?'<details class="panel lab-detail color-section"><summary>Registrar serie óptica</summary><form data-color-form="calibrate"><div class="form-grid">'+
   field('title','Nombre de la serie','text','',true)+options('ink','Tinta o concentrado',products,true)+options('base','Base o vehículo',products,true)+treatmentFields()+
   field('calibration','Matriz medida (primera fila: nm, 0, 5, 10; demás filas: longitud de onda y reflectancias %)','textarea','',true)+
   field('evidence','Instrumento, espesor, respaldo, lotes y referencia del ensayo','textarea','',true)+
   field('confirmed','Confirmo película ópticamente gruesa, sustrato opaco, ausencia de fluorescencia y dispersión comparable','checkbox')+'</div>'+
   notice('Solo para una tinta diluida en una base fija. Usa las mismas condiciones y la misma malla en toda la serie. La primera fila indica el porcentaje en masa de tinta de cada muestra.')+
   '<div class="form-actions"><button class="primary">Guardar serie</button></div>'+output+'</form></details>':'')+
   '<div class="section-head"><h2>Series guardadas</h2></div><section class="panel">'+
   (curves.map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.context.substrate)+' · '+esc(record.value.series.samples.length)+' muestras medidas</small></div>'+
    btn('Ver evidencia','data-color-curve='+record.id,'chart','text-button')+'</div>').join('')||notice('Registra una serie de pruebas para evaluar una predicción.'))+'</section>';
 }
 const contextsMatch=(a,b)=>sameMeasurement(a,b)&&['technology','substrate','anilox','bcm','geometry'].every(key=>normalize(a[key])===normalize(b[key]));
 function spectralContext(data){
  const result=context(data);
  result.illuminant=result.illuminant.toUpperCase();
  result.observer=data.observer;result.geometry=String(data.geometry||'').trim();
  if(!result.geometry||!observers.includes(result.observer)||!measurementConditions.includes(result.condition))throw new Error('Indica la geometría, el observador y la condición de medición.');
  return result;
 }
 function massDescription(sample,mass,ink,base){
  const grams=mass*sample.concentration/100;
  return '<p>'+esc(label(ink))+' '+grams.toFixed(3)+' g ('+sample.concentration.toFixed(3)+' %); '+
   esc(label(base))+' '+(mass-grams).toFixed(3)+' g ('+(100-sample.concentration).toFixed(3)+' %).</p>';
 }
 async function submit(form){
  const input=Object.fromEntries(new FormData(form));
  const mode=form.dataset.colorForm;
  if(mode==='import'){
   if(!editable())throw new Error('Tu rol no permite importar patrones.');
   const file=input.file;
   if(!file?.size||file.size>700_000||!/\.csv$/i.test(file.name))throw new Error('Selecciona un CSV de hasta 700 KB.');
   const rows=parseStandardsCsv(await file.text());pending.set(form,rows);form.dataset.colorForm='import-save';
   form.innerHTML=notice(rows.length+' patrones validados. Las coincidencias exactas en tu biblioteca se omitirán.')+
    '<div class="table-scroll inventory-review"><table class="table"><thead><tr><th>Nombre</th><th>Código</th><th>Biblioteca</th><th>Lectura</th></tr></thead><tbody>'+
    rows.map(({title,value})=>'<tr><td>'+esc(title)+'</td><td>'+esc(value.target)+'</td><td>'+esc(value.collection)+'</td><td>'+esc(value.lab||'Reflectancia')+'</td></tr>').join('')+
    '</tbody></table></div><div class="form-actions"><button class="primary">Guardar patrones</button></div>'+output;
   return;
  }
  if(mode==='import-save'){
   const {count,skipped}=await api('color-standards',{items:pending.get(form)});
   await refresh();document.querySelector('#dialog').close();render();toast(count+' patrones guardados · '+skipped+' duplicados omitidos');return;
  }
  if(mode==='nearest'){
   const hits=nearestStandards(standards(),{...input,lab:parseLab(input.lab)},delta).slice(0,12);
   result(form,hits.length?hits.map(({record,difference})=>'<div class="record-row">'+chip(record)+'<div><strong>'+esc(label(record))+'</strong><small>'+
    esc(record.value.collection)+' · '+esc(record.value.customer||'Sin cliente asignado')+'</small></div><span>ΔE₀₀ '+difference.toFixed(2)+
    (record.value.tolerance!==''&&record.value.tolerance!=null?' · '+(difference<=Number(record.value.tolerance)?'Dentro de tolerancia':'Fuera de tolerancia'):'')+
    '</span></div>').join(''):notice('No hay patrones con CIELAB registrado bajo el mismo iluminante, observador, condición y filtros.'));
   return;
  }
  if(mode==='compare'){
   const a=standards().find(record=>record.id===Number(input.first)),b=standards().find(record=>record.id===Number(input.second));
   if(!a||!b||a===b)throw new Error('Selecciona dos patrones distintos.');
   const compatible=sameMeasurement(a.value,b.value);
   const numeric=compatible&&a.value.lab&&b.value.lab;
   result(form,'<div class="standard-comparison">'+[a,b].map(record=>'<div>'+chip(record)+'<strong>'+esc(label(record))+'</strong><p>'+esc(record.value.lab||'Sin CIELAB')+'</p></div>').join('')+'</div>'+
    (numeric?'<strong>ΔE₀₀ '+delta(parseLab(a.value.lab),parseLab(b.value.lab)).toFixed(2)+'</strong>':
     notice('Para calcular ΔE₀₀ ambos patrones necesitan CIELAB y la misma condición de medición, iluminante y observador.'))+
    (preview(a)||preview(b)?notice('Las muestras sRGB son aproximaciones de pantalla.'):''));return;
  }
  if(mode==='calibrate'){
   if(!editable())throw new Error('Tu rol no permite guardar series.');
   if(input.confirmed!=='on'||!input.evidence?.trim())throw new Error('Documenta y confirma las condiciones ópticas de la serie.');
   const ink=inks().find(r=>r.id===Number(input.ink)),base=inks().find(r=>r.id===Number(input.base)),conditions=spectralContext(input);
   if(!ink||!base||ink.id===base.id||[ink,base].some(r=>normalize(r.value.technology)!==normalize(conditions.technology)))
    throw new Error('Selecciona una base y una tinta diferentes de la tecnología indicada.');
   const series=parseCalibration(input.calibration);
   await api('records',{kind:'curvas',title:input.title,value:{series,context:conditions,inkId:ink.id,baseId:base.id,evidence:input.evidence,confirmed:true},status:'Registrada'});
   await refresh();render();toast('Serie medida guardada');return;
  }
  if(mode==='predict'){
   const record=own('curvas').find(r=>r.id===Number(input.curve)),pattern=standards().find(r=>r.id===Number(input.pattern)),conditions=spectralContext(input);
   if(!record?.value.confirmed||!contextsMatch(record.value.context,conditions))throw new Error('Reproduce las condiciones de tecnología, sustrato, anilox, BCM y medición de la serie.');
   if(pattern&&(!sameMeasurement(pattern.value,conditions)||normalize(pattern.value.geometry)!==normalize(conditions.geometry)))
    throw new Error('El patrón guardado y la serie deben compartir geometría, iluminante, observador y condición. Si falta la geometría, complétala en el patrón.');
   const target=spectrum(pattern?.value.spectrum||input.target),mass=positive(input.batch,'La cantidad de mezcla');
   const ink=inks().find(r=>r.id===record.value.inkId),base=inks().find(r=>r.id===record.value.baseId);
   if(!ink||!base)throw new Error('Falta algún componente activo en el catálogo.');
   const stocked=(product,grams)=>grams<=1e-9||(product.value.available!==false&&
    (product.value.stockGrams==null||product.value.stockGrams===''||Number(product.value.stockGrams)>=grams));
   const fit=spectralFit(record.value.series,target,concentration=>stocked(ink,mass*concentration/100)&&stocked(base,mass*(100-concentration)/100));
   if(!fit.predicted)return result(form,notice('La existencia registrada no alcanza para las proporciones de esta serie.'));
   pending.set(form,{record,pattern,target,mass,ink,base,fit});
   const curves=[['Patrón',target.map(pair=>pair[1])]];
   if(fit.observed)curves.push(['Mejor muestra medida',fit.observed.values]);
   if(!fit.predicted.measured)curves.push(['Estimación K/S',fit.predicted.values]);
   result(form,(fit.observed?'<h3>Primero prueba la mejor muestra medida</h3>'+massDescription(fit.observed,mass,ink,base)+
    '<p>Error espectral RMS '+fit.observed.rms.toFixed(3)+' puntos de reflectancia.</p>':notice('Ninguna concentración medida cumple con la existencia registrada.'))+
    (!fit.predicted.measured?'<h3>Propuesta teórica por interpolación</h3>'+massDescription(fit.predicted,mass,ink,base)+
     '<p>Error espectral RMS estimado '+fit.predicted.rms.toFixed(3)+' puntos. Intervalo medido '+fit.predicted.bracket.join('–')+' %.</p>':'')+
    spectralChart(fit.wavelengths,curves)+notice('El error espectral RMS no es ΔE. Prepara una muestra pequeña y mídela antes de escalar o aprobar la fórmula.')+
    (editable()&&!fit.predicted.measured?btn('Guardar como fórmula teórica','data-color-save','file'):''));
  }
 }
 async function click(button){
  const data=button.dataset;
  if(data.colorTool){open(data.colorTool);return true;}
  if(data.colorCurve){
   const record=own('curvas').find(r=>r.id===Number(data.colorCurve));
   if(record){
    const {series,context:ctx,evidence}=record.value;
    modal(record.title,notice([ctx.technology,ctx.substrate,ctx.anilox,ctx.bcm+' BCM',ctx.geometry,ctx.illuminant,ctx.observer,ctx.condition].join(' · '))+
     notice(evidence)+spectralChart(series.wavelengths,series.samples.slice(0,3).map(sample=>[sample.concentration+' % medido',sample.values]))+
     '<pre class="catalog-text">'+esc(['nm, '+series.samples.map(sample=>sample.concentration).join(', '),...series.wavelengths.map((nm,i)=>[nm,...series.samples.map(sample=>sample.values[i])].join(', '))].join('\n'))+'</pre>');
   }
   return true;
  }
  if(data.colorSave!==undefined){
   if(!editable())throw new Error('Tu rol no permite guardar fórmulas.');
   const {record,pattern,target,mass,ink,base,fit}=pending.get(button.closest('form'));
   const c=fit.predicted.concentration,parts=[[ink,c],[base,100-c]].filter(([,percent])=>percent>0),ctx=record.value.context;
   await api('records',{kind:'formulas',title:'Teórica · '+(pattern?.title||record.title),status:'Borrador',
    value:{target:pattern?.value.target||'Patrón espectral manual',technology:ctx.technology,substrate:ctx.substrate,anilox:ctx.anilox+' · '+ctx.bcm+' BCM',
     batch:String(mass),components:parts.map(([product,percent])=>product.value.code+': '+percent.toFixed(6)).join('\n'),
     notes:'Estimación Kubelka–Munk de una tinta en base fija. Prepara una muestra pequeña y verifica con el instrumento antes de aprobar.',
     evidenceType:'Teórica',spectralSeries:record.id,spectralTarget:target,spectralRms:fit.predicted.rms,processConditions:ctx}});
   await refresh();button.dataset.saved='true';toast('Fórmula teórica guardada como borrador');return true;
  }
  return false;
 }
 return {libraryActions,spectralView,submit,click};
}
