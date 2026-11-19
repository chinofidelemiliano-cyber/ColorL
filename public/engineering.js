import {cylinder,toothOptions,production,distortion,convert,unitNames,inkArea,reel,mounting,angular,oee,workshopInk} from './engineering-model.js';
import {loadExcel} from './catalog-import.js';

const defs={
 gap:['GAP','GAP = (TH × paso ÷ cavidades) − largo de etiqueta. Usa el paso verificado en mm.',['th','pitch','label','around'],cylinder,[['development','Desarrollo (mm)'],['gap','GAP (mm)']]],
 teeth:['Número de dientes','TH teórico = (etiqueta + GAP) × cavidades ÷ paso. La disponibilidad se consulta por paso y dientes.',['label','gap','pitch','around'],toothOptions,[['th','TH teórico']]],
 production:['Metros de producción','Metros netos = (etiquetas ÷ cavidades por vuelta) × desarrollo ÷ 1,000. La reserva usa vueltas completas, más desperdicio y preparación.',['quantity','quantityUnit','th','pitch','label','around','across','gap','waste','setup','speed'],production,[['development','Desarrollo (mm)'],['gap','GAP calculado (mm)'],['gapDifference','Diferencia frente al GAP indicado (mm)'],['labelsPerTurn','Etiquetas por vuelta'],['exactTurns','Vueltas netas'],['fullTurns','Vueltas completas'],['metres','Metros netos'],['fullMetres','Metros para vueltas completas'],['waste','Desperdicio (m)'],['setup','Preparación (m)'],['total','Material total a reservar (m)'],['workMinutes','Tiempo lineal estimado (min)'],['perMinute','Etiquetas por minuto'],['thousandPerHour','Millares por hora']]],
 distortion:['Distorsión de placa','Método aportado: (radio + cinta + poliéster) ÷ (radio + cinta + espesor total). Todos los espesores en mm. Comprueba con el fabricante y una prueba impresa.',['diameter','radius','tape','plate','polyester','length','required'],distortion,[['factor','Factor'],['scale','Escala (%)'],['reduction','Reducción (%)'],['compensated','Longitud compensada (mm)'],['fromRequired','Desviación (mm)']]],
 conversion:['Conversiones','Convierte mediante factores de unidad y redondea solo la presentación. Masa y volumen requieren densidad.',['value','from','to','decimals'],convert,[['shown','Resultado']]],
 area:['Consumo y área impresa','Área de banda = ancho efectivo × metros. Área cubierta = área de banda × cobertura. El consumo se expresa para ambas áreas y por metro lineal.',['width','metres','grams','coverage','labelWidth','labelLength','labels'],inkArea,[['area','Área de banda (m²)'],['covered','Área cubierta (m²)'],['labelsArea','Área de etiquetas (m²)'],['remaining','Área fuera de las etiquetas (m²)'],['utilization','Aprovechamiento (%)'],['linear','Consumo (g/m)'],['perMaterial','Consumo por m² de banda'],['perCovered','Consumo por m² cubierto']]],
 reel:['Bobinas','Longitud estimada = π × (diámetro² − núcleo²) ÷ (4 × calibre). Diámetros en mm y calibre en µm. Supone espesor uniforme suficiente y sin aire entre capas.',['diameter','core','thickness','reelLength'],data=>reel({...data,length:data.reelLength}),[['length','Longitud estimada (m)'],['estimatedDiameter','Diámetro objetivo (mm)']]],
 oee:['OEE','Disponibilidad × rendimiento × calidad. Velocidad ideal y tiempos deben corresponder al mismo trabajo y a la misma unidad.',['planned','running','rate','total','good'],oee,[['availability','Disponibilidad (%)'],['performance','Rendimiento (%)'],['quality','Calidad (%)'],['oee','OEE (%)']]],
 angular:['Fase circunferencial','Ángulo = desfase en dientes × 360 ÷ TH. El signo depende del sentido de giro documentado y la referencia debe identificarse.',['th','offset','angularRef'],data=>{if(!data.angularRef.trim())throw new Error('Identifica el diente y el sentido de medida.');return angular(data);},[['degrees','Desfase (°)']]],
 ink:['Tinta estimada y carga inicial','Masa transferida = área × volumen medido por m² × cobertura × transferencia × densidad. La carga inicial puede recuperarse; se incluye en la cantidad de tinta que debes tener disponible.',['area','bcm','coverage','transfer','density','waste','filling','actual'],workshopInk,[['theoretical','Transferencia estimada (kg)'],['actual','Consumo real ingresado (kg)'],['wasteKg','Desperdicio estimado (kg)'],['filling','Carga del sistema (kg)'],['minimum','Cantidad inicial a disponer (kg)']]],
 mount:['Montaje axial por estación','Cota = constante documentada − (referencia del suaje − referencia de estación) + distancia del engrane + compensación axial. Todas las cotas en mm y desde el mismo lado y origen.',['band','design'],mounting,[['axial','Cota desde la referencia (mm)'],['width','Ancho útil aplicable (mm)'],['band','Ancho de banda (mm)'],['design','Posición lateral indicada (mm)']]]
};
const inputs={
 th:['Dientes (TH)'],pitch:['Paso (mm)'],label:['Largo de etiqueta (mm)'],around:['Cavidades al desarrollo'],across:['Cavidades al eje'],gap:['GAP (mm)'],quantity:['Cantidad'],quantityUnit:['Unidad',['Etiquetas','Millares']],
 waste:['Desperdicio (%)','number',0],setup:['Preparación (m)','number',0],diameter:['Diámetro medido (mm)'],radius:['Radio medido (mm)'],tape:['Sticky Back (mm)'],
 plate:['Espesor total de placa (mm)'],polyester:['Poliéster (mm)'],length:['Longitud de diseño (mm)'],required:['Desarrollo requerido (mm, opcional)'],
 value:['Cantidad a convertir'],from:['De',unitNames],to:['A',unitNames],decimals:['Decimales','number',5],width:['Ancho efectivo (mm)'],metres:['Metros impresos'],grams:['Gramos consumidos'],
 coverage:['Cobertura (%)'],labelWidth:['Ancho de etiqueta (mm, opcional)'],labelLength:['Largo de etiqueta (mm, opcional)'],labels:['Cantidad de etiquetas (opcional)'],
 core:['Diámetro del núcleo (mm)'],thickness:['Calibre (µm)'],reelLength:['Longitud objetivo (m, opcional)'],
 planned:['Tiempo planificado (min)'],running:['Tiempo operativo (min)'],rate:['Velocidad ideal (etiquetas/min)'],total:['Producción total'],good:['Piezas buenas'],
 speed:['Velocidad (m/min, opcional)'],band:['Ancho de banda (mm)'],area:['Área de banda (m²)'],bcm:['BCM real medido'],transfer:['Transferencia (%)'],
 density:['Densidad (g/cm³)'],filling:['Carga del sistema (kg)','number',0],actual:['Consumo real (kg, opcional)'],
 offset:['Desfase firmado (dientes)'],angularRef:['Diente de referencia y sentido','text'],design:['Posición lateral del diseño (mm, opcional)']
};
const catalogs={
 'ing-cilindro':['Cilindros',[['code','ID interno'],['th','TH','number'],['pitch','Paso medido (mm)','number'],['diameter','Diámetro medido (mm)','number'],
  ['width','Largo útil (mm)','number'],['gear','Cota del engrane (mm)','number'],['reference','Origen y lado de medición'],['date','Fecha de medición','date'],
  ['plate','Placa compatible (mm)','number'],['tape','Sticky Back compatible (mm)','number'],['eccentricity','Excentricidad (mm)','number'],['bearings','Baleros y estado'],
  ['availability','Disponibilidad',['Disponible','En mantenimiento','Fuera de servicio']],['location','Ubicación'],['notes','Superficie, historial y planos','textarea']]],
 'ing-maquina':['Máquinas',[['code','Identificador'],['brand','Marca'],['model','Modelo'],['stations','Número de estaciones','number'],['width','Ancho máximo (mm)','number'],['speed','Velocidad máxima (m/min)','number'],
  ['pitch','Paso (mm)','number'],['constant','Constante de montaje documentada (mm)','number'],['constantSource','Origen documental de la constante'],['reference','Referencia axial exacta y lado'],
  ['notes','Entintado, secado, tensión, accesorios y mantenimiento','textarea']]],
 'ing-suaje':['Suajes',[['code','Código'],['supplier','Fabricante'],['type','Tipo'],['th','Dientes','number'],['pitch','Paso (mm)','number'],['development','Desarrollo (mm)','number'],
  ['diameter','Diámetro (mm)','number'],['width','Ancho (mm)','number'],['around','Cavidades al desarrollo','number'],['across','Cavidades al eje','number'],['label','Largo de etiqueta (mm)','number'],
  ['gap','GAP (mm)','number'],['die','Referencia de corte axial (mm)','number'],['reference','Origen y lado de medición'],['rewind','Sentido de desenrollado'],['notes','Material, liner y mantenimiento','textarea']]],
 'ing-yunque':['Yunques y estaciones',[['code','Identificación'],['stationName','Estación'],['type','Tipo'],['diameter','Diámetro (mm)','number'],['width','Ancho útil del yunque o estación (mm)','number'],
  ['station','Referencia de estación (mm)','number'],['correction','Compensación axial (mm)','number'],['reference','Origen y lado de medición'],['notes','Medidas adicionales, estado y plano','textarea']]],
 'ing-material':['Sustratos',[['code','Código'],['family','Material y familia'],['width','Ancho (mm)','number'],['thickness','Espesor (µm)','number'],
  ['gsm','Gramaje (g/m²)','number'],['opacity','Opacidad (%)','number'],['surface','Tratamiento (dinas/cm)','number'],['notes','Compatibilidad, liner y recomendaciones comprobadas','textarea']]]
};
const normalized=value=>String(value??'').trim().toLowerCase();
export function createEngineering({state,esc,field,heading,btn,modal,api,refresh,render,toast,download}){
 const own=kind=>state.records.filter(r=>r.kind===kind&&r.owner===state.user?.id&&r.status!=='Archivada');
 const editable=()=>state.user?.fullAccess&&!['operador','estudiante'].includes(state.user.role);
 const pending=new WeakMap();
 const num=v=>typeof v==='number'?v.toLocaleString('es-MX',{maximumFractionDigits:10}):String(v);
 const note=text=>'<p class="notice">'+esc(text)+'</p>';
 const error='<p class="error" role="alert"></p><div class="result" hidden></div>';
 const select=(name,title,records,selected='',required=false)=>'<label class="field">'+esc(title)+'<select name="'+name+'" '+(required?'required':'')+'><option value="">Seleccionar</option>'+
  records.map(r=>'<option value="'+r.id+'" '+(Number(selected)===r.id?'selected':'')+'>'+esc(r.title+' · '+(r.value.code||''))+'</option>').join('')+'</select></label>';
 const find=(kind,id)=>own(kind).find(record=>record.id===Number(id));
 const available=()=>own('ing-cilindro').filter(r=>r.value.availability==='Disponible');
 const measurements=value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,typeof v==='string'?v.trim():v]));
 function selectedComponents(input){
  const machine=find('ing-maquina',input.machine),roller=find('ing-cilindro',input.roller),yunque=find('ing-yunque',input.yunque),die=find('ing-suaje',input.die);
  if(!machine||!roller||!yunque||!die||roller.value.availability!=='Disponible')throw new Error('Selecciona máquina, suaje, estación y un cilindro disponible.');
  const parts=[roller,yunque,die];
  if(parts.some(r=>Number(r.value.machine)!==machine.id))throw new Error('Todos los componentes deben estar registrados para la misma máquina.');
  if(!machine.value.constantSource?.trim()||!machine.value.reference?.trim()||parts.some(r=>normalized(r.value.reference)!==normalized(machine.value.reference)))
   throw new Error('La máquina necesita una fuente para su constante y las cuatro fichas deben indicar el mismo origen y lado de medición.');
  if(!yunque.value.stationName?.trim())throw new Error('El yunque requiere la estación identificada.');
  if(![roller.value.th,die.value.th,roller.value.pitch,die.value.pitch,machine.value.pitch,roller.value.width,yunque.value.width,machine.value.width].every(v=>Number(v)>0)||
     Number(roller.value.th)!==Number(die.value.th)||[roller.value.pitch,die.value.pitch].some(p=>Math.abs(Number(p)-Number(machine.value.pitch))>1e-8))
   throw new Error('Confirma ancho útil, TH y paso en las fichas. El engrane de máquina, cilindro y suaje debe coincidir.');
  return {machine,roller,yunque,die,data:{...input,constant:machine.value.constant,gear:roller.value.gear,station:yunque.value.station,
   correction:yunque.value.correction,die:die.value.die,width:Math.min(roller.value.width,yunque.value.width,machine.value.width)}};
 }
 function report(type,data){
  const def=defs[type],geometry=type==='mount'?data.components?.data:data.input;
  const rows=def[4].filter(([key])=>data.result[key]!=null).map(([key,label])=>'<div class="record-row"><div><strong>'+esc(label)+'</strong></div><span>'+esc(num(data.result[key]))+(key==='shown'?' '+esc(data.result.to):'')+'</span></div>').join('');
  let extra='';
  if(type==='teeth'){
   extra=data.result.alternatives.map(option=>{
    const matches=available().filter(r=>Number(r.value.th)===option.teeth&&Math.abs(Number(r.value.pitch)-data.result.pitch)<1e-8&&(!data.input.machine||Number(r.value.machine)===Number(data.input.machine)));
    return note(option.teeth+' dientes · GAP '+num(option.gap)+' mm · '+(option.gap<0?'solapamiento; ': '')+
     (matches.length?'en inventario: '+matches.map(r=>r.title).join(', '):'sin cilindros disponibles con estos datos'));
   }).join('');
  }
  if(type==='gap'){
   const {around,label,development}=data.result;
   if(Number.isSafeInteger(around)&&around>0&&around<=80&&Number.isFinite(label)&&development>0){
    const radius=47, perimeter=2*Math.PI*radius, segment=perimeter/around;
    const labels=Array.from({length:around},(_,i)=>'<circle cx="66" cy="66" r="'+radius+'" fill="none" stroke="var(--cyan)" stroke-width="9" stroke-dasharray="'+(perimeter*label/development)+' '+perimeter+'" stroke-dashoffset="'+(-i*segment)+'"/>').join('');
    extra='<svg class="eng-cylinder" viewBox="0 0 132 132" role="img" aria-label="Distribución circunferencial de etiquetas"><circle cx="66" cy="66" r="47" fill="none" stroke="var(--line)" stroke-width="9"/>'+labels+
     '<text x="66" y="70" text-anchor="middle" fill="currentColor">'+around+' cavidades</text></svg>'+note('La sección iluminada representa las etiquetas. Los espacios corresponden al GAP.');
   }
  }
  if(type==='distortion'&&data.alternative)extra=note('Segundo cilindro · escala '+num(data.alternative.scale)+' % · longitud '+num(data.alternative.compensated)+' mm · diferencia '+num(data.alternative.compensated-data.result.compensated)+' mm.');
  if(type==='mount'&&geometry&&Array.isArray(data.context)){
   const x=32+420*data.result.axial/data.result.width;
   extra='<svg class="eng-mount" viewBox="0 0 480 110" role="img" aria-label="Cota axial desde la referencia registrada"><rect x="32" y="35" width="420" height="40" fill="none" stroke="currentColor"/>'+
    '<path d="M'+x+' 24V87 M32 15V90 M32 22H'+x+'" stroke="var(--cyan)" fill="none"/><text x="32" y="104" fill="currentColor">Origen</text></svg>'+
    note(data.context.join(' · '))+note('Datos utilizados: constante '+geometry.constant+' mm, suaje '+geometry.die+' mm, estación '+geometry.station+' mm, engrane '+geometry.gear+' mm y compensación '+geometry.correction+' mm.');
  }
  return note(def[1])+rows+extra;
 }
 function view(){
  return heading('Ingeniería flexográfica','Calcula desarrollos y cotas con los componentes medidos de tu taller.',editable()?btn('Nueva orden técnica','data-eng-order','plus','primary'):'')+
   '<div class="tool-grid">'+Object.entries(defs).map(([key,def])=>'<section class="panel"><h2>'+esc(def[0])+'</h2>'+note(def[1])+btn('Abrir calculadora','data-eng-calc='+key,'calc')+'</section>').join('')+'</div>'+
   '<div class="section-head"><h2>Catálogos técnicos</h2></div><div class="tool-grid">'+Object.entries(catalogs).map(([key,[name]])=>'<section class="panel"><h2>'+esc(name)+'</h2>'+
    note(own(key).length+' fichas')+btn('Consultar catálogo','data-eng-list='+key,'grid')+'</section>').join('')+'</div>'+
   '<div class="section-head"><h2>Cálculos guardados</h2></div><section class="panel">'+(own('ing-calculo').map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>'+esc(defs[r.value.type]?.[0]||'Cálculo')+'</small></div>'+btn('Abrir reporte','data-eng-report='+r.id,'file')+'</div>').join('')||note('Todavía no guardaste cálculos.'))+'</section>'+
   '<div class="section-head"><h2>Órdenes técnicas</h2></div><section class="panel">'+(own('ing-orden').map(record=>'<div class="record-row"><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.value.machine?.title||'')+'</small></div>'+
    btn('Abrir orden','data-eng-order-id='+record.id,'file')+'</div>').join('')||note('Todavía no guardaste órdenes.'))+'</section>';
 }
 function catalog(kind){
  modal(catalogs[kind][0],(editable()?btn('Agregar ficha','data-eng-new='+kind,'plus','primary'):'')+
   (own(kind).map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.value.code||'')+
    (kind==='ing-cilindro'?(!Number(r.value.diameter)||!Number(r.value.pitch)?' · Pendiente de medición':' · Circunferencia física '+num(Math.PI*Number(r.value.diameter))+' mm · Desarrollo '+num(Number(r.value.th||0)*Number(r.value.pitch))+' mm'):'')+
    '</small></div>'+btn('Ver ficha','data-eng-record='+kind+' data-eng-id='+r.id,'chevron')+'</div>').join('')||note('No hay fichas registradas.')));
 }
 function catalogForm(kind,record){
  const v=record?.value||{};
  modal(catalogs[kind][0],'<form data-eng-form="catalog" data-kind="'+kind+'" data-id="'+(record?.id||'')+'"><div class="form-grid">'+
   field('title','Nombre de la ficha','text',record?.title,true)+
   (['ing-cilindro','ing-yunque','ing-suaje'].includes(kind)?select('machine','Máquina vinculada',own('ing-maquina'),v.machine):'')+
   catalogs[kind][1].map(([key,label,type])=>field(key,label,type,v[key],key==='code')).join('')+'</div>'+
   (editable()?'<div class="form-actions"><button class="primary">Guardar ficha</button></div>':'')+error+'</form>',true);
 }
 function orderEditor(){
  const reports=own('ing-calculo');
  modal('Nueva orden técnica','<form data-eng-form="order"><div class="form-grid">'+field('title','Trabajo','text','',true)+
   select('machine','Máquina',own('ing-maquina'),'',true)+select('production','Cálculo de metros guardado',reports.filter(r=>r.value.type==='production'),'',true)+
   select('substrate','Sustrato',own('ing-material'))+select('pattern','Patrón propio',own('colores'))+
   select('formula','Fórmula aprobada propia',own('formulas').filter(r=>['Aprobada','Compartida'].includes(r.status)))+
   select('anilox','Anilox',own('anilox'))+field('route','Recorrido autorizado o referencia del procedimiento','textarea')+
   field('checks','Pruebas e inspecciones requeridas','textarea')+'</div>'+
   '<h3>Cálculos de montaje y distorsión</h3>'+ (reports.filter(r=>['mount','distortion'].includes(r.value.type)).map(record=>
    '<label class="order-choice"><input type="checkbox" name="attachment" value="'+record.id+'"> '+esc(record.title)+'</label>').join('')||note('Aún no hay cálculos guardados de estas operaciones.'))+
   '<div class="form-actions"><button class="primary">Guardar borrador de orden</button></div>'+error+'</form>',true);
 }
 function orderRows(value){
  const p=value.production?.value?.result||{};
  return [
   ['Ventas','Trabajo',value.work],['Producción','Máquina',value.machine?.title],
   ['Producción','Sustrato',value.substrate?.title],['Producción','Etiquetas',p.labels],['Producción','Metros netos',p.metres],
   ['Producción','Metros a reservar',p.total],['Preprensa','Desarrollo (mm)',p.development],['Preprensa','TH',p.th],
   ['Preprensa','GAP (mm)',p.gap],['Preprensa','Cavidades por vuelta',p.labelsPerTurn],
   ['Laboratorio','Patrón',value.pattern?.title],['Laboratorio','Fórmula',value.formula?.title],
   ['Laboratorio','Componentes (%)',value.formula?.value?.components],['Producción','Anilox',value.anilox?.title],
   ['Producción','BCM real',value.anilox?.value?.real],['Producción','Recorrido documentado',value.route],
   ['Calidad','Inspecciones y pruebas',value.checks],
   ...(value.attachments||[]).flatMap(r=>(defs[r.value.type]?.[4]||[]).map(([key,label])=>['Montaje',r.title+' · '+label,r.value.result[key]]))
  ];
 }
 function orderReport(record){
  const rows=orderRows(record.value);
  modal(record.title,note('Borrador técnico. Comprueba las cotas, la seguridad del trabajo y los datos pendientes antes de liberar la orden.')+
   '<div class="table-scroll"><table class="table"><thead><tr><th>Área</th><th>Dato</th><th>Valor documentado</th></tr></thead><tbody>'+
   rows.map(([area,label,value])=>'<tr><td>'+esc(area)+'</td><td>'+esc(label)+'</td><td>'+esc(value===null||value===undefined||value===''?'Pendiente':num(value))+'</td></tr>').join('')+'</tbody></table></div>'+
   '<div class="form-actions">'+btn('Exportar orden a Excel','data-eng-order-excel='+record.id,'file')+
   btn('Imprimir / PDF','data-eng-print','file')+'</div>',true);
 }
 function calculator(type){
  const def=defs[type],roll=available(),linkedTypes=['gap','production','distortion','angular'];
  const optional=['radius','diameter','required','labelWidth','labelLength','labels','reelLength','design','speed','actual'];
  modal(def[0],note(def[1])+'<form data-eng-form="calc" data-type="'+type+'"><div class="form-grid">'+field('title','Nombre para el historial','text',def[0],true)+
   (type==='mount'?select('machine','Máquina',own('ing-maquina'),'',true)+select('roller','Cilindro',roll,'',true)+
    select('yunque','Yunque / estación',own('ing-yunque'),'',true)+select('die','Suaje',own('ing-suaje'),'',true):
    linkedTypes.includes(type)?select('roller','Usar medidas de un cilindro (opcional)',roll):'')+
   (type==='ink'?select('anilox','Anilox registrado (opcional)',own('anilox').filter(r=>Number(r.value.real)>0)):'')+
   (type==='teeth'?select('machine','Filtrar cilindros por máquina (opcional)',own('ing-maquina')):'')+
   (type==='distortion'?select('alternate','Segundo cilindro para comparar (opcional)',roll):'')+
   def[2].map(key=>{const [label,input='number',value]=inputs[key];return field(key,label,input,value,!optional.includes(key)&&!(key==='gap'&&type==='production'));}).join('')+
   '</div><div class="form-actions"><button class="primary">Calcular</button></div>'+error+'</form>',true);
 }
 function change(el){
  if(el.name==='anilox'&&el.form?.dataset.type==='ink'){
   const selected=find('anilox',el.value);
   if(selected)el.form.elements.namedItem('bcm').value=selected.value.real;
   return;
  }
  if(el.name!=='roller'||el.form?.dataset.engForm!=='calc'||el.form.dataset.type==='mount')return;
  const roller=find('ing-cilindro',el.value);
  if(!roller)return;
  for(const key of ['th','pitch','diameter']){
   const input=el.form.elements.namedItem(key);
   if(input)input.value=Number(roller.value[key])>0?roller.value[key]:'';
  }
  for(const key of ['tape','plate']){
   const input=el.form.elements.namedItem(key);
   if(input&&Number(roller.value[key])>0)input.value=roller.value[key];
  }
 }
 async function submit(form){
  const values=new FormData(form), {title,...input}=measurements(Object.fromEntries(values));
  if(form.dataset.engForm==='order'){
   if(!editable())throw new Error('Tu rol no permite guardar órdenes.');
   const machine=find('ing-maquina',input.machine), production=find('ing-calculo',input.production);
   if(!machine||production?.value.type!=='production')throw new Error('Selecciona una máquina y un cálculo de metros guardado.');
   const attachments=values.getAll('attachment').map(id=>find('ing-calculo',id)).filter(r=>r&&['mount','distortion'].includes(r.value.type));
   if(attachments.some(r=>r.value.type==='mount'&&r.value.components?.machine?.id!==machine.id))
    throw new Error('Los cálculos de montaje deben corresponder a la máquina de la orden.');
   const roller=find('ing-cilindro',production.value.input?.roller);
   if(roller&&Number(roller.value.machine)!==machine.id)throw new Error('El cilindro del cálculo de metros pertenece a otra máquina.');
   if(Number(machine.value.pitch)>0&&Math.abs(Number(machine.value.pitch)-Number(production.value.result.pitch))>1e-8)
    throw new Error('El paso de máquina y del cálculo de metros no coinciden.');
   const linked=find('formulas',input.formula);
   if(linked&&!['Aprobada','Compartida'].includes(linked.status))throw new Error('La orden requiere una fórmula aprobada.');
   await api('records',{kind:'ing-orden',title,value:{work:title,machine,production,attachments,substrate:find('ing-material',input.substrate),
    pattern:find('colores',input.pattern),formula:linked,anilox:find('anilox',input.anilox),route:input.route,checks:input.checks},status:'Borrador'});
   await refresh();document.querySelector('#dialog').close();render();toast('Orden guardada');return;
  }
  if(form.dataset.engForm==='catalog'){
   if(!editable())throw new Error('Tu rol no permite editar las fichas.');
   const id=Number(form.dataset.id)||undefined, kind=form.dataset.kind;
   if(!title||!input.code)throw new Error('Escribe un nombre y un código.');
   if(own(kind).some(r=>r.id!==id&&normalized(r.value.code)===normalized(input.code)))throw new Error('Ya existe una ficha con ese código.');
   // Un cero en una dimensión de ficha representa un dato pendiente.
   for(const key of ['th','pitch','diameter','width','development','plate','tape','thickness']){
    if(input[key]==='0')input[key]='';
    if(input[key]&&Number(input[key])<0)throw new Error('Las medidas físicas deben ser positivas.');
   }
   await api('records',{id,kind,title,value:input,status:'Registrada'});await refresh();render();catalog(kind);toast('Ficha guardada');return;
  }
  const type=form.dataset.type,components=type==='mount'?selectedComponents(input):null;
  const result=defs[type][3](components?.data||input);
  let alternative=null;
  if(type==='distortion'&&input.alternate){
   const roller=find('ing-cilindro',input.alternate);
   if(!roller||!Number(roller.value.diameter))throw new Error('El segundo cilindro necesita un diámetro medido.');
   alternative=distortion({...input,diameter:roller.value.diameter,radius:''});
  }
  const data={type,input,result,alternative,components,context:components?
   [components.machine.title,'Estación '+components.yunque.value.stationName,components.roller.title,components.die.title,components.machine.value.reference,'Fuente: '+components.machine.value.constantSource]:[]};
  pending.set(form,{title,data});const out=form.querySelector('.result');out.hidden=false;
  out.innerHTML=report(type,data)+(editable()?btn('Guardar cálculo','data-eng-save','file','primary'):'');
 }
 async function excel(record){
  const excel=await loadExcel(),book=new excel.Workbook(),sheet=book.addWorksheet('Cálculo');
  sheet.addRows([[record.title],[defs[record.value.type][1]],['Dato','Resultado'],...defs[record.value.type][4].filter(([key])=>record.value.result[key]!=null).map(([key,name])=>[name,record.value.result[key]])]);
  const parameters=book.addWorksheet('Entradas');parameters.addRows(Object.entries(record.value.components?.data||record.value.input||{}));
  sheet.getColumn(1).width=40;sheet.getColumn(2).width=25;
  download('colorl-ingenieria.xlsx',await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 async function click(button){
  const d=button.dataset;
  if(d.engOrder!==undefined&&editable())return orderEditor();
  if(d.engOrderId){const record=find('ing-orden',d.engOrderId);if(record)orderReport(record);return;}
  if(d.engOrderExcel){
   const record=find('ing-orden',d.engOrderExcel);if(!record)return;
   const excel=await loadExcel(),book=new excel.Workbook(),sheet=book.addWorksheet('Orden técnica');
   sheet.addRows([[record.title],['Área','Dato','Valor documentado'],...orderRows(record.value)]);
   for(const column of sheet.columns)column.width=25;
   download('colorl-orden.xlsx',await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');return;
  }
  if(d.engCalc&&defs[d.engCalc])return calculator(d.engCalc);
  if(d.engList&&catalogs[d.engList])return catalog(d.engList);
  if(d.engNew&&catalogs[d.engNew]&&editable())return catalogForm(d.engNew);
  if(d.engRecord&&catalogs[d.engRecord]){const record=find(d.engRecord,d.engId);if(record)catalogForm(d.engRecord,record);return;}
  if(d.engSave!==undefined&&editable()){
   const {title,data}=pending.get(button.closest('form'));
   await api('records',{kind:'ing-calculo',title,value:data,status:'Registrada'});await refresh();document.querySelector('#dialog').close();render();toast('Cálculo guardado');return;
  }
  if(d.engReport){
   const record=find('ing-calculo',d.engReport);
   if(record&&defs[record.value.type])modal(record.title,report(record.value.type,record.value)+
    '<div class="form-actions">'+btn('Exportar Excel','data-eng-excel='+record.id,'file')+btn('Imprimir / PDF','data-eng-print','file')+'</div>',true);
   return;
  }
  if(d.engExcel){const record=find('ing-calculo',d.engExcel);if(record)await excel(record);return;}
  if(d.engPrint!==undefined){
   document.body.classList.add('print-study');window.addEventListener('afterprint',()=>document.body.classList.remove('print-study'),{once:true});window.print();
  }
 }
 return {view,change,click,submit};
}
