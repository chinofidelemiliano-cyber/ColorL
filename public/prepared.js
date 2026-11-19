import {encodeFile} from './catalog-import.js';
import {parseLab,positive,technologies} from './lab-model.js';
import {candidateLots} from './reuse.js';
import {displayLab} from './instrument.js';

export function createPrepared({state,field,esc,heading,btn,modal,api,refresh,render,toast,delta,recipe}){
 const batches=()=>state.records.filter(r=>r.kind==='preparados'&&r.owner===state.user.id);
 const formulas=()=>state.records.filter(r=>r.kind==='formulas'&&(r.owner===state.user.id||r.status==='Compartida'));
 const allowed=()=>!['operador','estudiante'].includes(state.user.role);
 const fields=[
  ['target','Código del color o Pantone'],['lot','Lote'],['preparedKg','Cantidad preparada (kg)','number'],['quantity','Existencia inicial (kg)','number'],
  ['location','Ubicación'],['technology','Tecnología',['',...technologies]],['family','Familia de tinta o sistema compatible'],['date','Fecha de preparación','date'],['customer','Cliente'],['work','Trabajo'],
  ['anilox','Anilox y BCM medido'],['substrate','Sustrato'],['lab','CIELAB final'],['condition','Condición M',['','M0','M1','M2','M3']],
  ['illuminant','Iluminante / observador'],['delta','ΔE₀₀ final registrado','number'],['responsible','Responsable'],
  ['expiry','Caducidad confirmada','date'],['reuseStatus','Aptitud del sobrante',['Pendiente','Verificado','No apto']],
  ['reuseUntil','Revisión de aptitud válida hasta','date'],['reuseEvidence','Verificación de contaminación, degradación y compatibilidad','textarea'],
  ['cost','Costo total de elaboración','number'],['currency','Moneda',['','MXN','USD','EUR']],['notes','Observaciones','textarea']
 ];
 const choose=(name,label,records,selected)=>'<label class="field">'+esc(label)+'<select name="'+name+'"><option value="">Seleccionar</option>'+
  records.map(r=>'<option value="'+r.id+'" '+(r.id===selected?'selected':'')+'>'+esc(r.title)+'</option>').join('')+'</select></label>';
 const notice=text=>'<p class="notice">'+esc(text)+'</p>';
 const errors='<p class="error" role="alert"></p><div class="result" hidden></div>';
 const kg=value=>Number(value).toLocaleString('es-MX',{maximumFractionDigits:6})+' kg';
 function batchForm(record){
  const v=record?.value||{}, working=Boolean(record);
  modal(working?'Lote preparado':'Registrar lote preparado','<form data-prepared="save" data-id="'+(record?.id||'')+'"><div class="form-grid">'+
   field('title','Nombre','text',record?.title,true)+(working?notice('Fórmula de origen: '+(v.formulaTitle||'Sin fórmula vinculada')):choose('formulaId','Fórmula de origen (opcional)',formulas(),null))+
   fields.map(([key,label,type])=>working&&key==='quantity'?notice('Existencia: '+kg(v.quantity)+'. Ajusta el saldo en Movimientos del lote.'):
    field(key,label,type,v[key],['target','lot','preparedKg','quantity','date','responsible'].includes(key))).join('')+
   field('components','Componentes documentados (código: porcentaje)','textarea',v.components||'')+'</div>'+
   (v.originalComponents?'<details><summary>Receta original</summary><pre class="catalog-text">'+esc(v.originalComponents)+'</pre></details>':'')+
   (v.photo?'<img class="batch-photo" src="/api/prepared-photo?id='+record.id+'" alt="Fotografía del lote">':'')+
   '<div class="form-actions">'+(allowed()?'<button class="primary">Guardar lote</button>':'')+
   (working?btn('Movimientos del lote','data-stock-movement='+record.id,'history')+btn('Calcular escala','data-prepared-scale','calc')+
    (allowed()?btn('Fotografía','data-prepared-photo='+record.id,'file'):''):'')+'</div>'+errors+'</form>');
 }
 function view(){
  return heading('Colores preparados','Administra lotes, sus recetas, saldos y mediciones.',allowed()?btn('Registrar lote','data-prepared-new','plus','primary'):'')+
   '<div class="form-actions lab-actions">'+btn('Comparar lotes','data-prepared-compare','palette')+btn('Buscar sobrantes aptos','data-prepared-reuse','drop')+'</div><section class="panel">'+
   (batches().map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+
    esc([record.value.target,record.value.lot,record.value.location,kg(record.value.quantity)].filter(Boolean).join(' · '))+'</small></div>'+
    btn('Abrir lote','data-prepared-open='+record.id,'chevron','text-button')+'</div>').join('')||notice('Todavía no has registrado colores preparados.'))+'</section>';
 }
 async function submit(form){
  const data=Object.fromEntries(new FormData(form)),mode=form.dataset.prepared;
  if(mode==='reuse'){
   const request={...data,lab:parseLab(data.lab),mass:positive(data.mass,'La masa solicitada'),tolerance:positive(data.tolerance,'La tolerancia')};
   const fresh=data.fresh===''?null:Number(data.fresh);
   if(fresh!=null&&(!Number.isFinite(fresh)||fresh<0))throw new Error('Indica un costo por kg mayor o igual a cero.');
   const matches=candidateLots(batches(),request,delta);
   const result=form.querySelector('.result');result.hidden=false;
   result.innerHTML=matches.length?matches.map(({record,distance,kilograms})=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>Lote '+esc(record.value.lot)+' · ΔE₀₀ '+distance.toFixed(2)+' · '+kg(kilograms)+
    (fresh==null?'':' · compra de tinta fresca evitada '+esc((kilograms*fresh).toFixed(2)))+'</small></div>'+
    btn('Ver lote','data-prepared-open='+record.id,'chevron','text-button')+'</div>').join('')+
    notice('Cada opción se evalúa como uso directo en el mismo sistema. Comprueba el lote con una muestra antes de reservarlo. El valor de compra evitada excluye costos de prueba y reproceso.'):
    notice('No hay sobrantes vigentes, verificados y dentro de tolerancia para estas condiciones.');
   return;
  }
  if(mode==='compare'){
   const first=batches().find(r=>r.id===Number(data.a)),second=batches().find(r=>r.id===Number(data.b));
   if(!first||!second||first===second)throw new Error('Selecciona dos lotes distintos.');
   const pair=[first,second], same=first.value.condition&&first.value.condition===second.value.condition&&first.value.illuminant&&first.value.illuminant===second.value.illuminant;
   const result=form.querySelector('.result');result.hidden=false;
   const readings=pair.every(r=>r.value.lab)?pair.map(r=>parseLab(r.value.lab)):null;
   result.innerHTML='<div class="standard-comparison">'+pair.map((r,i)=>{
    const preview=readings?displayLab(readings[i],r.value.illuminant):null;
    return '<div>'+ (preview?'<span class="standard-chip" style="--ink:'+preview.hex+'"></span>':'')+
    '<strong>'+esc(r.title)+'</strong>'+notice('Lote '+r.value.lot+' · '+kg(r.value.quantity))+'<pre class="catalog-text">'+esc(r.value.components||'Sin receta documentada')+'</pre></div>';
   }).join('')+'</div>'+(same&&readings?notice('ΔE₀₀ entre lotes '+delta(...readings).toFixed(2)+'. La vista sRGB es aproximada.'):notice('ΔE₀₀ requiere dos lecturas CIELAB con condiciones iguales.'));
   return;
  }
  if(!allowed())throw new Error('Tu rol no permite modificar estos lotes.');
  if(mode==='save'){
   const id=Number(form.dataset.id)||undefined,{title,...value}=data;
   if(value.lab.trim()){value.lab=parseLab(value.lab).join(', ');if(!value.condition||!value.illuminant.trim())throw new Error('Indica las condiciones del CIELAB final.');}
   if(value.components.trim())recipe({...value,batch:Number(value.preparedKg)*1000});
   await api('records',{id,kind:'preparados',title,value:{...value,formulaId:value.formulaId?Number(value.formulaId):null},status:'Registrada'});
  }else if(mode==='photo'){
   const file=data.file;
   if(!file?.size||file.size>1_000_000)throw new Error('Selecciona una imagen de hasta 1 MB.');
   await api('prepared-photo',{id:Number(form.dataset.id),filename:file.name,data:await encodeFile(file)});
  }
  await refresh();document.querySelector('#dialog').close();render();toast('Lote guardado');
 }
 async function click(button){
  const d=button.dataset;
  if(d.preparedNew!==undefined){if(allowed())batchForm();return true;}
  if(d.preparedOpen){const record=batches().find(r=>r.id===Number(d.preparedOpen));if(record)batchForm(record);return true;}
  if(d.preparedReuse!==undefined){
   modal('Buscar sobrantes aptos','<form data-prepared="reuse"><div class="form-grid">'+
    field('lab','CIELAB objetivo','text','',true)+field('tolerance','Tolerancia ΔE₀₀','number',2,true)+field('mass','Cantidad necesaria (kg)','number','',true)+
    field('technology','Tecnología',technologies)+field('family','Familia de tinta','text','',true)+field('substrate','Sustrato','text','',true)+
    field('condition','Condición M',['M0','M1','M2','M3'],'M1')+field('illuminant','Iluminante / observador','text','D50 / 2°',true)+field('fresh','Costo por kg de tinta fresca (opcional)','number')+
    '</div><div class="form-actions"><button class="primary">Buscar coincidencias</button></div>'+errors+'</form>');return true;
  }
  if(d.preparedCompare!==undefined){
   modal('Comparar lotes','<form data-prepared="compare"><div class="form-grid">'+choose('a','Primer lote',batches())+choose('b','Segundo lote',batches())+
    '</div><div class="form-actions"><button class="primary">Comparar</button></div>'+errors+'</form>');return true;
  }
  if(d.preparedPhoto){
   if(allowed())modal('Fotografía del lote','<form data-prepared="photo" data-id="'+Number(d.preparedPhoto)+'">'+
    '<label class="field">PNG, JPEG o WebP<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required></label>'+
    '<div class="form-actions"><button class="primary">Guardar fotografía</button></div>'+errors+'</form>');
   return true;
  }
  if(d.preparedScale!==undefined){
   const record=batches().find(r=>r.id===Number(button.closest('form').dataset.id));
   modal('Escalar receta del lote','<form data-prepared="scale" data-id="'+record.id+'">'+field('batch','Nueva cantidad (g)','number','',true)+
    '<div class="form-actions"><button class="primary">Calcular escala</button></div>'+errors+'</form>');return true;
  }
  return false;
 }
 function scaled(form){
  const record=batches().find(r=>r.id===Number(form.dataset.id));
  const result=form.querySelector('.result');
  result.innerHTML=recipe({components:record.value.components,batch:new FormData(form).get('batch')});result.hidden=false;
 }
 return {view,submit,click,scaled};
}
