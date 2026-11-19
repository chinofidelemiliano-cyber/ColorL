import {chartTypes,gage,histogram,parseGage,parseSubgroups,scatter,spc} from './spc.js';
import {examples,methods,riskPriority} from './improvement.js';
import {loadExcel} from './catalog-import.js';
import {individuals,pareto,readObservations} from './quality-model.js';

export function createQuality({state,esc,field,heading,btn,modal,api,refresh,render,toast,download}){
 const own=kind=>state.records.filter(record=>record.kind===kind&&record.owner===state.user?.id&&record.status!=='Archivada');
 const pending=new WeakMap();
 const canEdit=()=>state.user?.fullAccess&&!['operador','estudiante'].includes(state.user.role);
 const output='<p class="error" role="alert"></p><div class="result" hidden aria-live="polite"></div>';
 const empty=text=>'<p class="notice">'+esc(text)+'</p>';
 const optional=input=>String(input??'').trim()===''?null:Number(input);
 const n=value=>Number(value).toLocaleString('es-MX',{maximumFractionDigits:4});
 function chart(values,lines,label){
  const limits=[...values,...lines.flatMap(line=>line[1])],min=Math.min(...limits),max=Math.max(...limits),span=max-min||1;
  const x=i=>42+i*466/Math.max(values.length-1,1),y=v=>110-(v-min)*88/span;
  return '<figure class="lab-spectrum"><svg viewBox="0 0 530 140" role="img" aria-label="'+esc(label)+'"><path d="M42 18V110H510" stroke="currentColor" fill="none"/>'+
   lines.map(([name,value])=>Array.isArray(value)?
    '<polyline points="'+value.map((v,i)=>x(i)+','+y(v)).join(' ')+'" stroke="var(--pink)" stroke-dasharray="4 4" fill="none"><title>'+esc(name)+'</title></polyline>':
    '<path d="M42 '+y(value)+'H510" stroke="var(--pink)" stroke-dasharray="4 4"/><text x="43" y="'+Math.max(12,y(value)-3)+'" fill="currentColor">'+esc(name)+' '+n(value)+'</text>').join('')+
   '<polyline points="'+values.map((v,i)=>x(i)+','+y(v)).join(' ')+'" fill="none" stroke="var(--cyan)" stroke-width="2"/>'+
   '<text x="42" y="132" fill="currentColor">1</text><text x="480" y="132" fill="currentColor">'+values.length+'</text></svg><figcaption>'+esc(label)+'</figcaption></figure>';
 }
 function controlReport(values,opts){
  const metrics=individuals(values,opts);
  const {mean,lcl,ucl,rangeMean,mrUcl,signals,rangeSignals,outside,capability}=metrics;
  const capabilityLabel=capability?Object.entries(capability).filter(([,number])=>number!==null).map(([key,number])=>key.toUpperCase()+' '+n(number)).join(' · '):
   'Capacidad sin estimar. Requiere al menos 25 observaciones, variación medible, límites de especificación, ausencia de señales en estas cartas y supuestos confirmados.';
  return '<p><strong>'+values.length+' observaciones</strong> · media '+n(mean)+' · fuera de especificación '+outside+'</p>'+
   chart(values,[['LSC',ucl],['Media',mean],['LIC',lcl]],'Observaciones individuales')+
   chart(metrics.ranges,[['LSC',mrUcl],['Rango medio',rangeMean]],'Rangos móviles consecutivos')+
   '<p>Fuera de control (individual): '+esc(signals.join(', ')||'ningún punto')+'. Rango móvil fuera de control: '+esc(rangeSignals.join(', ')||'ningún punto')+'.</p>'+
   '<p>'+esc(capabilityLabel)+'</p><p>La carta detecta puntos fuera de los límites calculados. Los índices estimados requieren comprobar estabilidad, distribución y sistema de medición.</p>';
 }
 function subgroupReport(value){
  const result=spc(value.rows,value.chartType,value.opts);
  return result.charts.map(series=>chart(series.points,[['LSC',series.upper],['Centro',series.center],['LIC',series.lower]],series.name)+
   '<p>Fuera de control en '+esc(series.name)+': '+esc(series.signals.join(', ')||'ningún punto')+'.</p>').join('')+
   (result.capability?'<p>'+Object.entries(result.capability).map(([type,number])=>esc(type.toUpperCase()+' '+n(number))).join(' · ')+'</p>':
    (value.chartType.startsWith('X')?empty('Capacidad sin estimar. Usa 25 subgrupos, ambos límites y supuestos confirmados. Investiga primero las señales fuera de control.'):''))+
   (result.smallCounts?empty('Los recuentos pequeños o nulos limitan la interpretación de los límites aproximados.'):'')+
   empty('Los límites provienen del proceso. La ausencia de puntos fuera de límite no demuestra estabilidad por sí sola.');
 }
 function analysisReport(value){
  if(value.type==='gage'){
   const result=gage(value.rows);
   return empty(result.p+' piezas · '+result.o+' operadores · '+result.r+' repeticiones por combinación')+
    '<p><strong>Gage R&R</strong> '+(result.studyPercent==null?'indeterminado con variación total nula':n(result.studyPercent)+' % de variación del estudio')+'</p>'+
    Object.entries(result.components).map(([name,variance])=>empty(name+' · desviación estándar '+n(Math.sqrt(variance)))).join('')+
    (result.roundedToZero.length?empty('Componentes negativos estimados y truncados a cero: '+result.roundedToZero.join(', ')):'')+
    empty('ANOVA cruzado balanceado con interacción. Verifica representatividad, repetición independiente y criterio interno de aceptación.');
  }
  if(value.type==='histogram'){
   const groups=histogram(value.values,value.bins), max=Math.max(...groups.map(g=>g.count));
   return '<div class="table-scroll"><table class="table"><thead><tr><th>Intervalo</th><th>Frecuencia</th></tr></thead><tbody>'+
    groups.map((g,i)=>'<tr><td>'+n(g.from)+' ≤ x '+(i===groups.length-1?'≤':'&lt;')+' '+n(g.to)+'</td><td><meter min="0" max="'+max+'" value="'+g.count+'"></meter> '+g.count+'</td></tr>').join('')+
    '</tbody></table></div>'+empty('Observa forma, concentración y colas. Antes de combinar turnos o sustratos verifica si representan el mismo proceso.');
  }
  const {r}=scatter(value.rows), xs=value.rows.map(v=>v[0]),ys=value.rows.map(v=>v[1]);
  const scale=(v,values)=> (v-Math.min(...values))/(Math.max(...values)-Math.min(...values)||1);
  return '<figure class="lab-spectrum"><svg viewBox="0 0 530 140" role="img" aria-label="Diagrama de pares X Y"><path d="M42 18V110H510" stroke="currentColor" fill="none"/>'+
   value.rows.map(([x,y])=>'<circle cx="'+(42+466*scale(x,xs))+'" cy="'+(110-88*scale(y,ys))+'" r="3" fill="var(--cyan)"><title>'+n(x)+', '+n(y)+'</title></circle>').join('')+'</svg></figure>'+
   empty(r==null?'La correlación no se define si alguna variable es constante.':'Correlación de Pearson '+n(r)+'. Una asociación no prueba causalidad.');
 }
 function paretoReport(items){
  return '<div class="table-scroll"><table class="table"><thead><tr><th>Categoría</th><th>Frecuencia</th><th>Porcentaje</th><th>Acumulado</th></tr></thead><tbody>'+
   items.map(item=>'<tr><td>'+esc(item.label)+'</td><td>'+n(item.count)+'</td><td><meter min="0" max="100" value="'+Number(item.percentage)+'"></meter> '+n(item.percentage)+' %</td><td>'+n(item.cumulative)+' %</td></tr>').join('')+'</tbody></table></div>';
 }
 const correctiveFields=[
  ['issue','Problema observado'],['owner','Responsable'],['event','Tipo de evento',['No conformidad','Retrabajo','Desperdicio','Reclamación']],
  ['reworkKg','Retrabajo (kg)','number'],['wasteKg','Desperdicio (kg)','number'],
  ['containment','Acción de contención','textarea'],
  ['action','Acción correctiva permanente','textarea'],['deadline','Fecha compromiso','date'],['evidence','Evidencia o referencia','textarea'],['verification','Resultado de verificación','textarea']
 ];
 function cases(){
  return own('calidad-acciones').map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc((record.value.methodology||'5 porqués')+' · '+record.value.owner)+' · '+esc(record.value.deadline||'Sin fecha')+' · '+esc(record.status)+'</small></div>'+
   btn('Consultar','data-quality-case='+record.id,'file','text-button')+'</div>').join('')||empty('Todavía no hay acciones registradas.');
 }
 function view(){
  const actions=own('calidad-acciones'),rework=actions.reduce((total,record)=>total+(Number(record.value.reworkKg)||0),0),
   waste=actions.reduce((total,record)=>total+(Number(record.value.wasteKg)||0),0),complaints=actions.filter(record=>record.value.event==='Reclamación').length;
  return heading('Control de calidad','Analiza la estabilidad, prioriza defectos y documenta acciones correctivas.')+
   '<section class="panel lab-detail">'+empty('Retrabajo registrado '+n(rework)+' kg · desperdicio '+n(waste)+' kg · reclamaciones '+complaints)+'</section>'+
   '<details class="panel lab-detail" open><summary>Carta I–MR y capacidad</summary><form data-quality-form="control"><div class="form-grid">'+
   field('title','Nombre del estudio','text','',true)+field('data','Observaciones cronológicas (decimales con punto)','textarea','',true)+
   field('lower','Límite inferior de especificación','number')+field('upper','Límite superior de especificación','number')+
   field('assumptions','Confirmo proceso aproximadamente estable y normal, con mediciones independientes','checkbox')+'</div><div class="form-actions"><button class="primary">Analizar</button></div>'+output+'</form></details>'+
   '<details class="panel lab-detail"><summary>Cartas por subgrupo y atributos</summary><form data-quality-form="subgroups"><div class="form-grid">'+
   field('title','Nombre del estudio','text','',true)+field('chartType','Tipo de carta',chartTypes)+
   field('data','Datos por subgrupo, un renglón por muestra','textarea','',true)+
   field('lower','Límite inferior de especificación para X̄','number')+field('upper','Límite superior de especificación para X̄','number')+
   field('assumptions','Confirmo estabilidad, normalidad aproximada e independencia para estimar capacidad','checkbox')+'</div>'+
   empty('X̄–R y X̄–S: lecturas individuales, p. ej. 49.9 50.1 50.0. P y NP: unidades defectuosas y unidades inspeccionadas, p. ej. 5 100. C: recuento de defectos con oportunidad fija. U: defectos y unidades, con oportunidad comparable por unidad.')+
   '<div class="form-actions"><button class="primary">Calcular carta</button></div>'+output+'</form></details>'+
   '<details class="panel lab-detail"><summary>Histogramas, dispersión y Gage R&R</summary><form data-quality-form="analysis"><div class="form-grid">'+
   field('title','Nombre del estudio','text','',true)+field('analysis','Estudio',['Histograma','Dispersión','Gage R&R'])+
   field('data','Datos del estudio','textarea','',true)+field('bins','Clases (solo histograma)','number',8)+'</div>'+
   empty('Histograma: lista de lecturas. Dispersión: pares X Y por línea, por ejemplo velocidad y ΔE. Gage: pieza;operador;valor por línea, con repeticiones balanceadas.')+
   '<div class="form-actions"><button class="primary">Analizar datos</button></div>'+output+'</form></details>'+
   '<details class="panel lab-detail"><summary>Pareto de defectos</summary><form data-quality-form="pareto"><div class="form-grid">'+
   field('title','Nombre del análisis','text','',true)+field('data','Categoría: frecuencia, una por línea','textarea','',true)+
   '</div><div class="form-actions"><button class="primary">Ordenar y calcular</button></div>'+output+'</form></details>'+
   '<div class="section-head"><h2>Acciones correctivas</h2>'+(canEdit()?btn('Registrar acción','data-quality-new','plus','primary'):'')+'</div><section class="panel">'+cases()+'</section>'+
   '<div class="section-head"><h2>Estudios guardados</h2></div><section class="panel">'+(own('calidad-estudios').map(record=>
   '<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.type==='control'?'Carta I–MR':record.value.type==='subgroups'?record.value.chartType:({gage:'Gage R&R',histogram:'Histograma',scatter:'Dispersión'}[record.value.type]||'Pareto'))+'</small></div>'+
   btn('Abrir estudio','data-quality-study='+record.id,'chart','text-button')+'</div>').join('')||empty('Todavía no hay estudios guardados.'))+'</section>';
 }
 function methodFields(method,value={}){
  const selected=Object.hasOwn(methods,method)?method:'5 porqués';
  return empty(examples[selected])+methods[selected].map(([key,label,type])=>field(key,label,type||'textarea',value[key])).join('');
 }
 function change(el){
  if(el.name!=='methodology'||el.form?.dataset.qualityForm!=='action')return;
  const section=el.form.querySelector('[data-quality-method]');
  const values=Object.fromEntries(new FormData(el.form));
  section.innerHTML=methodFields(el.value,values);
 }
 function caseEditor(record){
  const value=record?.value||{};
  modal(record?'Acción correctiva':'Registrar acción correctiva','<form data-quality-form="action" data-id="'+(record?.id||'')+'"><div class="form-grid">'+
   correctiveFields.map(([key,label,type])=>field(key,label,type,value[key],['issue','owner'].includes(key))).join('')+
   field('methodology','Método',Object.keys(methods),value.methodology||'5 porqués')+
   '<div class="wide form-grid" data-quality-method>'+methodFields(value.methodology||'5 porqués',value)+'</div>'+
   field('verified','Efectividad verificada','checkbox',record?.status==='Completada')+'</div>'+
   (value.priority!=null?empty('Prioridad de riesgo registrada '+value.priority+'. Revisa la severidad independientemente del producto de las puntuaciones.'):'')+
   '<div class="form-actions">'+(canEdit()?'<button class="primary">Guardar acción</button>':'')+
   (record?btn('Ver reporte','data-quality-case-report='+record.id,'file'):'')+'</div>'+output+'</form>');
 }
 async function save(record){
  await api('records',record);await refresh();document.querySelector('#dialog').close();render();toast('Registro de calidad guardado');
 }
 async function submit(form){
  const input=Object.fromEntries(new FormData(form)), type=form.dataset.qualityForm;
  if(type==='action'){
   if(!canEdit())throw new Error('Tu rol no permite modificar acciones.');
   const {issue,verified,...value}=input;
   if(['reworkKg','wasteKg'].some(key=>value[key]!==''&&(!Number.isFinite(Number(value[key]))||Number(value[key])<0)))throw new Error('Captura masas mayores o iguales a cero.');
   if(value.methodology==='AMEF')value.priority=riskPriority(value);

   if(verified==='on'&&(!value.verification?.trim()||!value.action?.trim()))throw new Error('Registra la acción y la evidencia de efectividad para cerrarla.');
   await save({id:Number(form.dataset.id)||undefined,title:issue,kind:'calidad-acciones',value:{...value,issue},status:verified==='on'?'Completada':'Registrada'});return;
  }
  let value, report;
  if(type==='control'){
   const values=readObservations(input.data);
   const opts={lower:optional(input.lower),upper:optional(input.upper),assumptions:input.assumptions==='on'};
   value={type,values,opts};report=controlReport(values,opts);
  }else if(type==='analysis'){
   value=input.analysis==='Histograma'?{type:'histogram',values:readObservations(input.data),bins:Number(input.bins)}:
    input.analysis==='Dispersión'?{type:'scatter',rows:parseSubgroups(input.data)}:{type:'gage',rows:parseGage(input.data)};
   report=analysisReport(value);
  }else if(type==='subgroups'){
   value={type,rows:parseSubgroups(input.data),chartType:input.chartType,opts:{lower:optional(input.lower),upper:optional(input.upper),assumptions:input.assumptions==='on'}};
   report=subgroupReport(value);
  }else{
   const rows=input.data.trim().split(/\n+/).map(line=>{
    const i=line.lastIndexOf(':');
    return {category:i<1?'':line.slice(0,i),count:i<1?0:line.slice(i+1).trim()};
   });
   const items=pareto(rows);value={type,items};report=paretoReport(items);
  }
  pending.set(form,{kind:'calidad-estudios',title:input.title,value,status:'Registrada'});
  const result=form.querySelector('.result');result.hidden=false;result.innerHTML=report+(canEdit()?btn('Guardar estudio','data-quality-save','file'):'');
 }
 async function exportStudy(item){
  if(!item)return;
  const excel=await loadExcel(), book=new excel.Workbook();
  const sheet=book.addWorksheet('Estudio');
  const {title,value}=item;
  sheet.addRow([title]);
  if(value.type==='control'){
   const metrics=individuals(value.values,value.opts);
   sheet.addRows([['Lectura','Valor','Rango móvil'],...value.values.map((v,i)=>[i+1,v,i===0?null:metrics.ranges[i-1]])]);
   const summary=book.addWorksheet('Indicadores');
   summary.addRows(Object.entries({Media:metrics.mean,LIC:metrics.lcl,LSC:metrics.ucl,Fuera_de_especificacion:metrics.outside,...metrics.capability}));
  }else if(value.type==='histogram'){
   sheet.addRows([['Desde','Hasta','Frecuencia'],...histogram(value.values,value.bins).map(({from,to,count})=>[from,to,count])]);
  }else if(value.type==='scatter'){
   sheet.addRows([['X','Y'],...value.rows,['Pearson',scatter(value.rows).r]]);
  }else if(value.type==='gage'){
   sheet.addRows([['Pieza','Operador','Lectura'],...value.rows]);
   const metrics=gage(value.rows), summary=book.addWorksheet('Componentes de varianza');
   summary.addRows([...Object.entries(metrics.components),['Gage R&R % de variación',metrics.studyPercent]]);
  }else if(value.type==='subgroups'){
   const metrics=spc(value.rows,value.chartType,value.opts);
   sheet.addRows([['Subgrupo','Datos'],...value.rows.map((row,i)=>[i+1,row.join(', ')])]);
   for(const [index,series] of metrics.charts.entries()){
    const tab=book.addWorksheet('Carta '+(index+1));
    tab.addRows([['Subgrupo','Valor','Centro','LIC','LSC'],...series.points.map((point,i)=>[i+1,point,series.center,series.lower[i],series.upper[i]])]);
   }
   if(metrics.capability){const tab=book.addWorksheet('Capacidad');tab.addRows(Object.entries(metrics.capability));}
  }else{
   sheet.addRows([['Categoría','Frecuencia','Porcentaje','Acumulado'],...value.items.map(row=>[String(row.label),Number(row.count),Number(row.percentage),Number(row.cumulative)])]);
  }
  for(const tab of book.worksheets)tab.columns.forEach(column=>column.width=25);
  download('colorl-estudio.xlsx',await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 function actionRows(item){
  const methodsFields=methods[item.value.methodology]||methods['5 porqués'];
  const fields=[...correctiveFields,...methodsFields,['methodology','Método'],['priority','Prioridad de riesgo']];
  return [['Estado',item.status],...fields.filter(([key])=>item.value[key]!=null&&item.value[key]!=='').map(([key,label])=>[label,String(item.value[key])])];
 }
 async function click(button){
  if(button.dataset.qualityNew!==undefined){if(canEdit())caseEditor();return true;}
  if(button.dataset.qualityCaseReport){
   const item=own('calidad-acciones').find(r=>r.id===Number(button.dataset.qualityCaseReport));
   if(item)modal(item.title,actionRows(item).map(([label,value])=>'<div class="record-row"><div><strong>'+esc(label)+'</strong><p>'+esc(value)+'</p></div></div>').join('')+
    '<div class="form-actions">'+btn('Exportar Excel','data-quality-case-excel='+item.id,'file')+btn('Imprimir / PDF','data-quality-print','file')+'</div>',true);
   return true;
  }
  if(button.dataset.qualityCaseExcel){
   const item=own('calidad-acciones').find(r=>r.id===Number(button.dataset.qualityCaseExcel));
   if(item){
    const excel=await loadExcel(), book=new excel.Workbook(),sheet=book.addWorksheet('Acción');
    sheet.addRows([[item.title],...actionRows(item)]);
    sheet.getColumn(1).width=35;sheet.getColumn(2).width=60;
    download('colorl-accion.xlsx',await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   }
   return true;
  }
  if(button.dataset.qualityCase){const item=own('calidad-acciones').find(r=>r.id===Number(button.dataset.qualityCase));if(item)caseEditor(item);return true;}
  if(button.dataset.qualityStudy){
   const item=own('calidad-estudios').find(r=>r.id===Number(button.dataset.qualityStudy));
   if(item)modal(item.title,(item.value.type==='control'?controlReport(item.value.values,item.value.opts):item.value.type==='subgroups'?subgroupReport(item.value):['gage','scatter','histogram'].includes(item.value.type)?analysisReport(item.value):paretoReport(item.value.items))+
    '<div class="form-actions">'+btn('Exportar Excel','data-quality-excel='+item.id,'file')+
    btn('Imprimir / PDF','data-quality-print','file')+'</div>',true);
   return true;
  }
  if(button.dataset.qualityExcel){await exportStudy(own('calidad-estudios').find(r=>r.id===Number(button.dataset.qualityExcel)));return true;}
  if(button.dataset.qualityPrint!==undefined){
   document.body.classList.add('print-study');
   window.addEventListener('afterprint',()=>document.body.classList.remove('print-study'),{once:true});
   window.print();return true;
  }
  if(button.dataset.qualitySave!==undefined){if(canEdit())await save(pending.get(button.closest('form')));return true;}
  return false;
 }
 return {view,submit,click,change};
}
