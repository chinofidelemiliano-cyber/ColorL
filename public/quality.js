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
  const limits=[...values,...lines.map(line=>line[1])],min=Math.min(...limits),max=Math.max(...limits),span=max-min||1;
  const x=i=>42+i*466/Math.max(values.length-1,1),y=v=>110-(v-min)*88/span;
  return '<figure class="lab-spectrum"><svg viewBox="0 0 530 140" role="img" aria-label="'+esc(label)+'"><path d="M42 18V110H510" stroke="currentColor" fill="none"/>'+
   lines.map(([name,value])=>'<path d="M42 '+y(value)+'H510" stroke="var(--pink)" stroke-dasharray="4 4"/><text x="43" y="'+Math.max(12,y(value)-3)+'" fill="currentColor">'+esc(name)+' '+n(value)+'</text>').join('')+
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
 function paretoReport(items){
  return '<div class="table-scroll"><table class="table"><thead><tr><th>Categoría</th><th>Frecuencia</th><th>Porcentaje</th><th>Acumulado</th></tr></thead><tbody>'+
   items.map(item=>'<tr><td>'+esc(item.label)+'</td><td>'+n(item.count)+'</td><td><meter min="0" max="100" value="'+Number(item.percentage)+'"></meter> '+n(item.percentage)+' %</td><td>'+n(item.cumulative)+' %</td></tr>').join('')+'</tbody></table></div>';
 }
 const correctiveFields=[
  ['issue','Problema observado'],['owner','Responsable'],
  ['containment','Acción de contención','textarea'],['why1','Primer porqué'],['why2','Segundo porqué'],['why3','Tercer porqué'],['why4','Cuarto porqué'],['why5','Quinto porqué'],
  ['action','Acción correctiva permanente','textarea'],['deadline','Fecha compromiso','date'],['evidence','Evidencia o referencia','textarea'],['verification','Resultado de verificación','textarea']
 ];
 function cases(){
  return own('calidad-acciones').map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.owner)+' · '+esc(record.value.deadline||'Sin fecha')+' · '+esc(record.status)+'</small></div>'+
   btn('Consultar','data-quality-case='+record.id,'file','text-button')+'</div>').join('')||empty('Todavía no hay acciones registradas.');
 }
 function view(){
  return heading('Control de calidad','Analiza la estabilidad, prioriza defectos y documenta acciones correctivas.')+
   '<details class="panel lab-detail" open><summary>Carta I–MR y capacidad</summary><form data-quality-form="control"><div class="form-grid">'+
   field('title','Nombre del estudio','text','',true)+field('data','Observaciones cronológicas (decimales con punto)','textarea','',true)+
   field('lower','Límite inferior de especificación','number')+field('upper','Límite superior de especificación','number')+
   field('assumptions','Confirmo proceso aproximadamente estable y normal, con mediciones independientes','checkbox')+'</div><div class="form-actions"><button class="primary">Analizar</button></div>'+output+'</form></details>'+
   '<details class="panel lab-detail"><summary>Pareto de defectos</summary><form data-quality-form="pareto"><div class="form-grid">'+
   field('title','Nombre del análisis','text','',true)+field('data','Categoría: frecuencia, una por línea','textarea','',true)+
   '</div><div class="form-actions"><button class="primary">Ordenar y calcular</button></div>'+output+'</form></details>'+
   '<div class="section-head"><h2>Acciones correctivas</h2>'+(canEdit()?btn('Registrar acción','data-quality-new','plus','primary'):'')+'</div><section class="panel">'+cases()+'</section>'+
   '<div class="section-head"><h2>Estudios guardados</h2></div><section class="panel">'+(own('calidad-estudios').map(record=>
   '<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.type==='control'?'Carta I–MR':'Pareto')+'</small></div>'+
   btn('Abrir estudio','data-quality-study='+record.id,'chart','text-button')+'</div>').join('')||empty('Todavía no hay estudios guardados.'))+'</section>';
 }
 function caseEditor(record){
  const value=record?.value||{};
  modal(record?'Acción correctiva':'Registrar acción correctiva','<form data-quality-form="action" data-id="'+(record?.id||'')+'"><div class="form-grid">'+
   correctiveFields.map(([key,label,type])=>field(key,label,type,value[key],['issue','owner'].includes(key))).join('')+
   field('verified','Efectividad verificada','checkbox',record?.status==='Completada')+'</div>'+
   (canEdit()?'<div class="form-actions"><button class="primary">Guardar acción</button></div>':'')+output+'</form>');
 }
 async function save(record){
  await api('records',record);await refresh();document.querySelector('#dialog').close();render();toast('Registro de calidad guardado');
 }
 async function submit(form){
  const input=Object.fromEntries(new FormData(form)), type=form.dataset.qualityForm;
  if(type==='action'){
   if(!canEdit())throw new Error('Tu rol no permite modificar acciones.');
   const {issue,verified,...value}=input;
   if(verified==='on'&&(!value.verification?.trim()||!value.action?.trim()))throw new Error('Registra la acción y la evidencia de efectividad para cerrarla.');
   await save({id:Number(form.dataset.id)||undefined,title:issue,kind:'calidad-acciones',value:{...value,issue},status:verified==='on'?'Completada':'Registrada'});return;
  }
  let value, report;
  if(type==='control'){
   const values=readObservations(input.data);
   const opts={lower:optional(input.lower),upper:optional(input.upper),assumptions:input.assumptions==='on'};
   value={type,values,opts};report=controlReport(values,opts);
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
  }else{
   sheet.addRows([['Categoría','Frecuencia','Porcentaje','Acumulado'],...value.items.map(row=>[String(row.label),Number(row.count),Number(row.percentage),Number(row.cumulative)])]);
  }
  for(const tab of book.worksheets)tab.columns.forEach(column=>column.width=25);
  download('colorl-estudio.xlsx',await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 async function click(button){
  if(button.dataset.qualityNew!==undefined){if(canEdit())caseEditor();return true;}
  if(button.dataset.qualityCase){const item=own('calidad-acciones').find(r=>r.id===Number(button.dataset.qualityCase));if(item)caseEditor(item);return true;}
  if(button.dataset.qualityStudy){
   const item=own('calidad-estudios').find(r=>r.id===Number(button.dataset.qualityStudy));
   if(item)modal(item.title,(item.value.type==='control'?controlReport(item.value.values,item.value.opts):paretoReport(item.value.items))+
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
 return {view,submit,click};
}
