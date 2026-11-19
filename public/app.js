import {BCM_TO_CM3_M2,estimateInk} from './print-calculations.js';
import {createInventory} from './inventory.js';
import { createLab } from './lab.js';
const paths={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>', flask:'<path d="M9 3h6m-5 0v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
 palette:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/>', chart:'<path d="M3 3v18h18M6 15l4-4 4 3 6-8"/>', sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
 spark:'<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5zM20 2v4m-2-2h4"/>', box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10"/>', book:'<path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2z"/>',
 file:'<path d="M6 3h8l4 4v14H6zm8 0v5h4M9 12h6m-6 4h6"/>', history:'<path d="M3 12a9 9 0 1 1 3 7M3 6v6h6m3-5v6l4 2"/>', grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', moon:'<path d="M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>', bell:'<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zm5 3h4"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', out:'<path d="M6 18 18 6M9 6h9v9"/>', chevron:'<path d="m9 6 6 6-6 6"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', x:'<path d="m6 6 12 12M18 6 6 18"/>', plus:'<path d="M12 4v16M4 12h16"/>', check:'<path d="m4 12 5 5L20 6"/>', drop:'<path d="M12 3c4 6 7 9 7 12a7 7 0 1 1-14 0c0-3 3-6 7-12z"/>', calc:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2m4 0h2m-8 4h2m4 0h2"/>'
};
const I = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shade = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#3b536e';
const swatch = color => '<div class="swatch" style="--ink:'+shade(color)+'"></div>';
const btn = (label,attrs='',icon='',kind='secondary') => '<button type="button" class="'+kind+'" '+attrs+'>'+ (icon ? I(icon) : '')+esc(label)+'</button>';
const navGroups = [
 ['GENERAL',[['inicio','Panel de inicio','home']]],
 ['LABORATORIO',[['formulas','Formulación','flask'],['igualacion','Igualación inteligente','spark'],['tintas','Catálogo de tintas','drop'],['caracterizaciones','Caracterización','sliders'],['colores','Biblioteca de colores','palette'],['mediciones','Colorimetría','chart'],['correcciones','Simulador y corrección','sliders'],['asistente','Asistente técnico','spark']]],
 ['GESTIÓN',[['inventario','Inventario de tintas','box'],['anilox','Inventario de anilox','grid'],['historial','Historial y reportes','history']]],
 ['RECURSOS',[['academia','Academia','book'],['componentes','Biblioteca técnica','file'],['calculadoras','Calculadoras','calc']]]
];
const views=Object.fromEntries(navGroups.flatMap(([,items])=>items.map(([key,label,icon])=>[key,{label,icon}]))); views.usuarios={label:'Administración',icon:'grid'};
const state={user:null,view:'inicio',records:[],theme:localStorage.getItem('colorl-theme')==='light'?'light':'dark',chartDays:7,chat:[]};
const dialog=$('#dialog'), modalBody=$('#dialog-body');
let resizeChart, toastTimer, draftTimer, draftPending, draftWrite=Promise.resolve();
function toast(message){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3500);}
async function api(path,data) {
 const response=await fetch('/api/'+path, data===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await response.json().catch(()=>null);
 if(!response.ok || !result)throw new Error(result?.error||'El servidor de ColorL no respondió correctamente. Intenta de nuevo.');

 return result;
}
const byKind=kind=>state.records.filter(r=>r.kind===kind);
function initializeTheme(){document.documentElement.dataset.theme=state.theme;$('#theme').innerHTML=I(state.theme==='dark'?'sun':'moon');}
const availableView=view=>Boolean(state.user&&Object.hasOwn(views,view)&&(state.user.fullAccess?(view!=='usuarios'||state.user.role==='administrador'):view==='mediciones'));
const defaultView=()=>state.user?.fullAccess?'inicio':'mediciones';
function navigate(view){
 if(!state.user)return;
 if(!availableView(view))view=defaultView();
 state.view=view;
 if(location.hash!=='#'+view) history.pushState(null,'','#'+view);
 $('#sidebar').classList.remove('open');
 dialog.close();render();window.scrollTo(0,0);
}
function render(){
 resizeChart?.disconnect();
 document.body.classList.toggle('access-locked',!state.user);
 initializeTheme();
 if(!state.user){$('#main').replaceChildren();$('#nav').replaceChildren();auth('login');return;}
 $('#access-gate').replaceChildren();
 if(!availableView(state.view))state.view=defaultView();
 const full=state.user.fullAccess;
 $('#crumb').textContent=full?views[state.view].label:'Comparar colores';
 const groups=!full ? [['HERRAMIENTAS',[['mediciones','Comparar colores','chart']]]] :
  state.user.role==='administrador' ? [...navGroups,['EQUIPO',[['usuarios','Administración','grid']]]] : navGroups;
 $('#search').hidden=!full;
 $('#notification').hidden=!full;
 $('#nav').innerHTML=groups.map(([name,items])=>'<span class="nav-heading">'+name+'</span>'+items.map(([key,label,icon])=>'<button class="nav-btn '+(key===state.view?'active':'')+'" '+(key===state.view?'aria-current="page"':'')+' data-view="'+key+'">'+I(icon)+label+'</button>').join('')).join('');
 const initials=state.user?.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase() || 'CL';
 $('#workspace-label').textContent=full?'Espacio personal':'Acceso de comparación';
 $('#profile').innerHTML='<span class="avatar">'+esc(initials)+'</span><span><strong>'+esc(state.user?.name || 'Usuario invitado')+'</strong><small>'+esc(full?state.user.role:'Comparación')+'</small></span>'+I('chevron');
 $('#account').textContent=initials;
 const content={...lab.views,inicio:dashboard,mediciones:measurements,correcciones:simulation,asistente:assistant,academia:academy,calculadoras:calculators,historial:reports,usuarios:users};
 $('#main').innerHTML=(content[state.view] || (()=>collection(state.view)))();
 initializeTheme();
 if(state.view==='inicio') chart();
 if(state.view==='usuarios') loadUsers();
}
const statusTag=status=>'<span class="tag '+(['Aprobada','Compartida','Completada'].includes(status)?'good':status==='En revisión'?'pending':'')+'">'+esc(status)+'</span>';
function recordRow(r){
 return '<div class="record-row">'+swatch(r.value.color)+'<div><strong>'+esc(r.title)+'</strong><small>'+esc(r.value.target || r.value.code || r.value.lot || r.status)+'</small></div>'+statusTag(r.status)+'</div>';
}
function dashboard(){
 const formulas=byKind('formulas'), measures=byKind('mediciones'), inventory=byKind('inventario');
 const signed=Boolean(state.user);
 const deviations=measures.filter(r=>r.value.method==='ΔE 2000').map(r=>Number(r.value.delta)).filter(Number.isFinite);
 const mean=deviations.length ? (deviations.reduce((a,b)=>a+b,0)/deviations.length).toFixed(2) : '—';
 const stock=inventory.reduce((sum,r)=>sum+(Number(r.value.quantity)||0),0);
 const cards=[
 ['palette','','colores',signed?byKind('colores').length:'24','Colores guardados',signed?'Patrones en tu biblioteca':'+3 esta semana'],
 ['flask','pink','formulas',signed?formulas.length:'12','Fórmulas realizadas',signed?'Fórmulas disponibles':'+2 esta semana'],
 ['sliders','orange','correcciones',signed?formulas.filter(r=>r.status==='En revisión').length:'5','Igualaciones pendientes','En seguimiento'],
 ['chart','purple','mediciones',signed?mean:'1.24','ΔE promedio',signed?'Mediciones ΔE 2000':'↓ 0.18 vs. periodo anterior']
 ];
 return '<section class="hero"><img class="hero-img" src="/hero.png" alt=""><div class="hero-content"><span class="hero-label">'+I('spark')+' LABORATORIO DE COLOR</span><h1>La ciencia <span>del color.</span></h1><p>Formula, mide y perfecciona tintas flexográficas en un solo espacio de trabajo.</p><div class="hero-actions">'+btn('Nueva fórmula','data-new="formulas"','flask','primary')+btn('Explorar biblioteca','data-view="colores"','palette')+'</div></div><span class="hero-caption">COLORIMETRÍA · FLEXOGRAFÍA</span></section>'+
 '<div class="section-head"><div><h2>Resumen del laboratorio</h2><p>'+ (signed?'Actividad y calidad de tu espacio de trabajo.':'Actividad y calidad de un espacio de demostración.')+'</p></div><span class="tag">'+(signed?'Espacio personal':'Datos de ejemplo')+'</span></div>'+
 '<div class="metrics">'+cards.map(([icon,tint,view,value,label,sub])=>'<button class="metric" data-view="'+view+'"><div class="metric-top"><span class="metric-icon '+tint+'">'+I(icon)+'</span>'+I('out')+'</div><strong>'+value+'</strong><span class="metric-label">'+label+'</span><small>'+sub+'</small></button>').join('')+'</div>'+
 '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Rendimiento colorimétrico</h2><p class="panel-sub">Evolución de ΔE 2000</p></div><select id="chart-days" aria-label="Periodo del gráfico" style="width:auto;padding:5px"><option value="7">7 días</option><option value="30" '+(state.chartDays===30?'selected':'')+'>30 días</option></select></div><div class="chart-area"><canvas id="quality-chart" aria-label="Gráfico de diferencias Delta E" role="img" tabindex="0"></canvas><span class="chart-tip" hidden></span></div><div class="legend"><span>ΔE medido</span><span>Tolerancia '+(signed?'por registro':'de ejemplo')+'</span></div></section><section class="panel"><div class="panel-head"><div><h2>Fórmulas recientes</h2><p class="panel-sub">Última actividad</p></div>'+btn('Ver todas','data-view="formulas"','chevron','text-button')+'</div>'+(formulas.slice(0,3).map(recordRow).join('') || '<p class="empty">Aún no hay fórmulas.</p>')+'</section></div>'+
 '<div class="section-head"><h2>Accesos rápidos</h2></div><div class="quick-grid">'+[['mediciones','chart','Comparar patrón y muestra'],['inventario','box',signed?stock.toFixed(2)+' kg registrados':'Consultar lotes'],['academia','book',signed?byKind('academia').length+' lecciones registradas':'Explorar lecciones']].map(([key,icon,description])=>'<button class="quick-card" data-view="'+key+'"><span class="metric-icon">'+I(icon)+'</span><span><strong>'+views[key].label+'</strong><small>'+description+'</small></span>'+I('chevron')+'</button>').join('')+'</div>'+
 (signed?'<div class="dashboard-grid"><section class="panel"><h2>Patrones favoritos</h2>'+(byKind('colores').filter(r=>r.value.favorite).slice(0,4).map(recordRow).join('') || '<p class="empty">Aún no hay favoritos.</p>')+'</section><section class="panel"><h2>Correcciones recientes</h2>'+(byKind('correcciones').slice(0,4).map(recordRow).join('') || '<p class="empty">Aún no hay correcciones.</p>')+'</section></div>':'')+'<div class="spectrum"></div>';
}
function chart(){
 const canvas=$('#quality-chart'), context=canvas.getContext('2d'), tip=$('.chart-tip');
 const measurements=byKind('mediciones').filter(r=>r.value.method==='ΔE 2000' && Date.now()-new Date(r.updated).valueOf()<state.chartDays*86400000).reverse();
 const actual=state.user?measurements.map(r=>Number(r.value.delta)):(state.chartDays===7?[1.53,1.35,1.62,1.11,1.27,.98,.79]:[1.86,1.75,1.52,1.67,1.41,1.34,1.22,.94]);
 const tolerance=state.user?measurements.map(r=>Number(r.value.tolerance)):actual.map(()=>1.15);
 const labels=state.user?measurements.map(r=>r.title):actual.map((_,i)=>state.chartDays===7?['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i]:String(1+i*4));
 let points=[], active=-1;
 function draw(){
  const {width,height}=canvas.getBoundingClientRect(), ratio=devicePixelRatio||1;
  canvas.width=width*ratio;canvas.height=height*ratio;context.scale(ratio,ratio);
  const css=getComputedStyle(document.documentElement), color=key=>css.getPropertyValue(key).trim();
  context.font='10px system-ui';context.lineWidth=1;
  if(!actual.length){context.fillStyle=color('--muted');context.textAlign='center';context.fillText('Registra una medición para ver el gráfico.',width/2,height/2);return;}
  const max=Math.max(2,...actual,...tolerance), left=32,right=13,top=11,bottom=height-23;
  const x=i=>actual.length===1?(width+left-right)/2:left+i*(width-left-right)/(actual.length-1);
  const y=v=>bottom-(bottom-top)*v/max;
  context.textAlign='left';
  for(let i=0;i<=4;i++){const val=max*i/4;context.strokeStyle=color('--line');context.beginPath();context.moveTo(left,y(val));context.lineTo(width-right,y(val));context.stroke();context.fillStyle=color('--faint');context.fillText(val.toFixed(1),2,y(val)+3);}
  context.textAlign='center';
  labels.forEach((label,i)=>{if(i%Math.max(1,Math.ceil(labels.length/7))===0)context.fillText(label.slice(0,10),x(i),height-3);});
  function line(data){context.beginPath();data.forEach((v,i)=>i?context.lineTo(x(i),y(v)):context.moveTo(x(i),y(v)));}
  line(actual);context.lineTo(x(actual.length-1),bottom);context.lineTo(x(0),bottom);context.closePath();
  const gradient=context.createLinearGradient(0,top,0,bottom);gradient.addColorStop(0,'#45e8d750');gradient.addColorStop(1,'#45e8d700');context.fillStyle=gradient;context.fill();
  context.strokeStyle=color('--pink');context.setLineDash([5,5]);line(tolerance);context.stroke();context.setLineDash([]);
  context.strokeStyle=color('--cyan');context.lineWidth=2;line(actual);context.stroke();context.fillStyle=color('--cyan');
  points=actual.map((v,i)=>({x:x(i),y:y(v)}));points.forEach((point,i)=>{context.beginPath();context.arc(point.x,point.y,i===active?5:3,0,Math.PI*2);context.fill();});
 }
 function highlight(i){if(!points.length)return;active=i;draw();tip.hidden=false;tip.textContent=labels[i]+' · ΔE '+actual[i].toFixed(2);tip.style.left=Math.max(0,Math.min(canvas.clientWidth-125,points[i].x-42))+'px';tip.style.top=Math.max(0,points[i].y-30)+'px';}
 resizeChart=new ResizeObserver(draw);resizeChart.observe(canvas);
 canvas.onpointermove=e=>{if(points.length)highlight(points.reduce((best,p,i)=>Math.abs(p.x-e.offsetX)<Math.abs(points[best].x-e.offsetX)?i:best,0));};
 canvas.onpointerleave=()=>{active=-1;tip.hidden=true;draw();};
 canvas.onkeydown=e=>{if(['ArrowRight','ArrowLeft'].includes(e.key)&&points.length){e.preventDefault();highlight(Math.max(0,Math.min(points.length-1,active+(e.key==='ArrowRight'?1:-1))));}};
}
const schemas={
 colores:[['target','Código Pantone o referencia'],['color','Vista previa sRGB','color'],['lab','L*, a*, b*'],['spectrum','Reflectancia (longitud de onda, valor)','textarea'],['customer','Cliente'],['substrate','Sustrato'],['tolerance','Tolerancia ΔE'],['favorite','Favorito','checkbox']],
 formulas:[['target','Color objetivo'],['color','Vista previa sRGB','color'],['technology','Tecnología',['Base agua','UV']],['family','Fabricante y familia'],['substrate','Sustrato y tratamiento'],['anilox','Anilox, lineatura y BCM real'],['batch','Cantidad a preparar (g)','number'],['conditions','Viscosidad, pH, temperatura y acabados'],['components','Componentes conocidos (uno por línea, nombre: porcentaje)','textarea'],['notes','Procedimiento, lotes y evidencia','textarea']],
 inventario:[['code','Código de tinta'],['lot','Lote'],['minStock','Stock mínimo (kg)','number'],['supplier','Proveedor'],['technology','Tecnología',['','Base agua','UV','Base solvente']],['quantity','Existencia (kg)','number'],['reportedQuantity','Saldo original del PDF (kg)','number'],['entryDate','Fecha de ingreso','date'],['expiry','Caducidad confirmada','date'],['lifeDays','Vigencia indicada en el PDF'],['cost','Costo por kg','number'],['currency','Moneda',['','MXN','USD','EUR']],['stockVerified','Existencia y aptitud verificadas','checkbox'],['notes','Compatibilidad, movimientos y sobrantes','textarea']],
 anilox:[['code','Código'],['lineature','Lineatura','number'],['nominal','BCM nominal','number'],['real','BCM real medido','number'],['sourceAporte','Aporte real según PDF (unidad por confirmar)','number'],['material','Material'],['density','Densidad reportada','number'],['geometry','Geometría'],['angle','Ángulo de grabado','number'],['measured','Fecha de medición','date'],['notes','Estado, limpieza y mediciones','textarea']],
 componentes:[['code','Fabricante y código'],['target','Familia o función'],['spectrum','Caracterización, reflectancia y concentración','textarea'],['notes','Compatibilidad, ficha técnica y hoja de seguridad','textarea']]
};
const heading=(title,description,action='')=>'<div class="page-head"><div><h1>'+title+'</h1><p>'+description+'</p></div>'+action+'</div>';
const field=(name,label,type='text',value='',required=false)=>{
 const attrs=' name="'+name+'" '+(required?'required ':'');
 let input;
 if(Array.isArray(type)) input='<select'+attrs+'>'+type.map(option=>'<option '+(option===value?'selected':'')+'>'+esc(option)+'</option>').join('')+'</select>';
 else if(type==='textarea') input='<textarea'+attrs+'>'+esc(value)+'</textarea>';
 else input='<input'+attrs+'type="'+type+'" '+(type==='number'?'step="any" ':'')+(type==='checkbox'?(value?'checked':''):'value="'+esc(type==='color'?shade(value):value)+'"')+'>';
 return '<label class="field '+(type==='textarea'?'wide':'')+'">'+esc(label)+input+'</label>';
};
const descriptions={colores:'Patrones propios, referencias Pantone y favoritos.',formulas:'Prepara, escala y comparte fórmulas verificadas.',inventario:'Consulta lotes, existencias y sobrantes de producción.',anilox:'Registra la geometría, el estado y el aporte de tus rodillos.',componentes:'Registra caracterizaciones y documentación del fabricante.'};
function collection(kind){
 const records=byKind(kind);
 const imported=['inventario','anilox'].includes(kind);
 return heading(views[kind].label,descriptions[kind],btn('Nuevo registro','data-new="'+kind+'"','plus','primary'))+
 (kind==='formulas'?'<div class="form-actions lab-actions">'+btn('Buscar una fórmula con mis tintas','data-view="igualacion"','spark')+'</div>':'')+
 (imported&&inventory.canEdit()?'<div class="form-actions lab-actions">'+btn('Importar PDF','data-inventory-open="'+kind+'"','file')+'</div>':'')+
 '<section class="panel"><input class="filter" id="filter" type="search" aria-label="Filtrar registros" placeholder="Filtrar por nombre, referencia o estado…"><div class="table-scroll"><table class="table"><thead><tr><th>Nombre</th><th>Referencia</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>'+records.map(r=>'<tr data-filter="'+esc([r.title,r.status,Object.values(r.value).join(' ')].join(' ').toLowerCase())+'"><td><div style="display:flex;align-items:center;gap:9px">'+swatch(r.value.color)+esc(r.title)+'</div></td><td>'+esc(r.value.target || r.value.code || r.value.lot || '—')+'</td><td>'+statusTag(r.status)+(kind==='inventario'&&r.value.quantity!=null&&r.value.quantity!==''?'<small class="inventory-stat">'+esc(r.value.quantity)+' kg</small>'+
 (r.value.minStock!==''&&r.value.minStock!=null&&Number(r.value.quantity)<=Number(r.value.minStock)?'<small class="inventory-alert">Stock mínimo</small>':''):'')+
 (kind==='anilox'&&Number(r.value.nominal)>0&&Number(r.value.real)>0?'<small class="inventory-stat">'+((Number(r.value.real)/Number(r.value.nominal)-1)*100).toFixed(1)+' % de desviación BCM</small>':'')+'</td><td>'+btn('Abrir','data-edit="'+r.id+'"','chevron','text-button')+'</td></tr>').join('')+'</tbody></table></div><p class="empty" id="no-results" '+(records.length?'hidden':'')+'>No hay registros que mostrar.</p></section>'+
 (imported?inventory.documentLinks(kind):'')+(kind==='colores'?'<p class="notice">Las referencias se registran manualmente. Una biblioteca oficial Pantone requiere licencia. Las muestras en pantalla son aproximaciones sRGB.</p>':'');
}
function modal(title,content,wide=false){
 dialog.classList.toggle('wide-dialog',wide);
 modalBody.innerHTML='<div class="dialog-title"><h2>'+esc(title)+'</h2><button class="icon-button" type="button" data-close aria-label="Cerrar">'+I('x')+'</button></div>'+content;
 if(!dialog.open) dialog.showModal();
}
function recipe(value){
 const total=Number(value.batch), raw=String(value.components||'').trim();
 if(!raw || !Number.isFinite(total) || total<=0) throw new Error('Ingresa un lote positivo y los porcentajes conocidos.');
 const parts=raw.split(/\n/).filter(s=>s.trim()).map(row=>{
  const split=row.lastIndexOf(':');
  const name=row.slice(0,split).trim(), text=row.slice(split+1).trim(), percentage=Number(text.replace(',','.'));
  if(split<1 || !name || !text || !Number.isFinite(percentage) || percentage<=0 || percentage>100) throw new Error('Usa el formato «componente: porcentaje».');
  return {name,percentage,grams:total*percentage/100};
 });
 if(Math.abs(parts.reduce((sum,p)=>sum+p.percentage,0)-100)>0.001) throw new Error('Los porcentajes deben sumar 100 %.');
 return parts.map(p=>esc(p.name)+' · '+p.percentage+' % · '+p.grams.toFixed(3)+' g').join('<br>');
}
function flushDraft(){
 clearTimeout(draftTimer);
 if(!draftPending)return draftWrite;
 const pending=draftPending;
 draftPending=null;
 draftWrite=draftWrite.catch(()=>{}).then(async()=>{
  try{
   await api('draft',{kind:pending.kind,content:pending.content});
   if(pending.status.isConnected)pending.status.textContent='Borrador guardado automáticamente';
  }catch(error){if(pending.status.isConnected)pending.status.textContent=error.message;}
 });
 return draftWrite;
}
async function editor(kind,r){
 if(!schemas[kind]) return;
 if(!state.user && !r) return auth();
 await flushDraft();
 const own=!r || (r.id>0 && state.user?.id===r.owner);
 const reviewing= r?.id>0 && ['administrador','supervisor'].includes(state.user?.role) && ['En revisión','Aprobada','Compartida'].includes(r.status) && kind==='formulas';
 const canEdit=own && !['estudiante','operador'].includes(state.user?.role);
 const draft=!r && canEdit ? (await api('draft?kind='+kind)).content : null;
 const value=r?.value||draft||{};
 modal(views[kind].label,'<form id="editor" data-kind="'+kind+'" data-id="'+(r?.id || '')+'"><div class="form-grid">'+field('title','Nombre','text',r?.title||draft?.title||'',true)+schemas[kind].map(([key,label,type])=>kind==='inventario'&&key==='quantity'&&r&&value.quantity!=null&&value.quantity!==''?
  '<label class="field">Existencia (kg) · usa Movimientos del lote<input readonly value="'+esc(value.quantity)+'"></label>':field(key,label,type,value[key])).join('')+'</div>'+
 (reviewing?field('shareScope','Visibilidad al compartir',['Todo el equipo','Laboratorio y supervisión','Solo supervisión'],value.shareScope):'')+
 (kind==='formulas'?'<p class="notice">El escalado usa porcentajes ingresados. Para predecir una mezcla se requieren curvas de caracterización compatibles con el sustrato y el anilox.</p><div class="result" hidden></div>':'')+
 (r?.value.sourcePage&&kind==='inventario'?'<p class="notice">Origen en PDF. Lote en página '+esc(r.value.sourcePage)+' y existencia en página '+esc(r.value.quantityPage)+'.</p>':'')+
 (r?.value.sourcePage&&kind==='anilox'?'<p class="notice">Origen en PDF. Datos en página 1 y observaciones en página 2.</p>':'')+
 '<div class="form-actions">'+(canEdit?'<button class="primary" name="status" value="Borrador">Guardar</button>':'')+(canEdit&&kind==='formulas'?'<button class="secondary" name="status" value="En revisión">Enviar a revisión</button>':'')+
 (kind==='formulas'?btn('Calcular gramajes','data-scale','calc'):'')+
 (kind==='inventario'&&r?.id?btn('Movimientos del lote','data-stock-movement="'+r.id+'"','history'):'')+
 (r?.value.source&&['inventario','anilox'].includes(kind)?inventory.original(r.value.source):'')+(reviewing?'<button class="secondary" name="status" value="Aprobada">Aprobar</button><button class="secondary" name="status" value="Compartida">Compartir con el equipo</button>':'')+'</div>'+(canEdit && !r?'<p id="draft-status" class="notice" role="status">'+(draft?'Borrador recuperado':'')+'</p>':'')+'<p class="error" role="alert"></p></form>');
}
const labFields=(prefix,values=[])=>['L*','a*','b*'].map((label,i)=>field(prefix+i,label,'number',values[i],true)).join('');
function measurements(){
 const full=state.user.fullAccess;
 return heading(full?'Colorimetría':'Comparar colores',full?'Compara CIELAB, interpreta desviaciones y registra resultados.':'Ingresa los valores CIELAB del patrón y de la muestra.',full?'':btn('Activar acceso completo','data-access','spark'))+
 '<form id="measure" class="panel"><div class="form-grid">'+(full?'<div class="wide">'+field('title','Nombre de la medición','text','')+'</div>':'')+'<div><h3>Patrón</h3><div class="form-grid">'+labFields('p')+'</div></div><div><h3>Muestra</h3><div class="form-grid">'+labFields('m')+'</div></div>'+field('tolerance','Tolerancia ΔE','number',2,true)+field('condition','Condición de medición',['M0','M1','M2','M3'])+field('illuminant','Iluminante / observador','text','D50 / 2°')+field('method','Método',['ΔE 2000','ΔE 76','ΔE 94 (artes gráficas)','CMC (2:1)'])+field('spectral','Reflectancia, densidad, condiciones o notas de instrumento','textarea')+'</div><div class="form-actions"><button class="primary">Calcular diferencia</button>'+(full?btn('Guardar medición','data-save-measure','check'):'')+'</div><p class="error"></p><div class="result" hidden></div></form>'+
 (full?'<div class="section-head"><h2>Mediciones guardadas</h2></div><section class="panel">'+(byKind('mediciones').map(recordRow).join('')||'<p class="empty">Aún no hay mediciones.</p>')+'</section>':'');
}
const hue=(a,b)=>(Math.atan2(b,a)*180/Math.PI+360)%360;
const cos=d=>Math.cos(d*Math.PI/180), sin=d=>Math.sin(d*Math.PI/180);
function differences(p,m) {
 const [l1,a1,b1]=p,[l2,a2,b2]=m;
 const dl=l2-l1,da=a2-a1,db=b2-b1,c1=Math.hypot(a1,b1),c2=Math.hypot(a2,b2),dc=c2-c1,dh=Math.sqrt(Math.max(0,da**2+db**2-dc**2));
 const avg=(c1+c2)/2,g=.5*(1-Math.sqrt(avg**7/(avg**7+25**7)));
 const ap1=(1+g)*a1,ap2=(1+g)*a2,cp1=Math.hypot(ap1,b1),cp2=Math.hypot(ap2,b2);
 const h1=hue(ap1,b1),h2=hue(ap2,b2),d=h2-h1;
 const diff=cp1*cp2===0?0:Math.abs(d)<=180?d:d>180?d-360:d+360;
 const h=cp1*cp2===0?h1+h2:Math.abs(d)<=180?(h1+h2)/2:(h1+h2+(h1+h2<360?360:-360))/2;
 const l=(l1+l2)/2,c=(cp1+cp2)/2,t=1-.17*cos(h-30)+.24*cos(2*h)+.32*cos(3*h+6)-.20*cos(4*h-63);
 const sl=1+.015*(l-50)**2/Math.sqrt(20+(l-50)**2),sc=1+.045*c,sh=1+.015*c*t;
 const rt=-2*Math.sqrt(c**7/(c**7+25**7))*sin(60*Math.exp(-(((h-275)/25)**2)));
 const x=dl/sl,y=(cp2-cp1)/sc,z=2*Math.sqrt(cp1*cp2)*sin(diff/2)/sh;
 const hc=hue(a1,b1), f=Math.sqrt(c1**4/(c1**4+1900)), tc=hc>=164&&hc<=345?.56+Math.abs(.2*cos(hc+168)):.36+Math.abs(.4*cos(hc+35));
 const cmcl=l1<16?.511:.040975*l1/(1+.01765*l1),cmcc=.0638*c1/(1+.0131*c1)+.638,cmch=cmcc*(f*tc+1-f);
 return {dl,da,db,dc,dh,c1,c2,h1:hue(a1,b1),h2:hue(a2,b2),e:[Math.sqrt(x*x+y*y+z*z+rt*y*z),Math.hypot(dl,da,db),Math.hypot(dl,dc/(1+.045*c1),dh/(1+.015*c1)),Math.hypot(dl/(2*cmcl),dc/cmcc,dh/cmch)]};
}
function labColor([l,a,b]){
 const fy=(l+16)/116, f=x=>x>6/29?x**3:3*(6/29)**2*(x-4/29), x=.95047*f(fy+a/500), y=f(fy), z=1.08883*f(fy-b/200);
 return '#'+[3.2406*x-1.5372*y-.4986*z,-.9689*x+1.8758*y+.0415*z,.0557*x-.204*y+1.057*z].map(c=>Math.round(255*Math.min(1,Math.max(0,c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055))).toString(16).padStart(2,'0')).join('');
}
const formData=f=>Object.fromEntries(new FormData(f));
function measure(form){
 if(!form.reportValidity()) return;
 const v=formData(form),get=prefix=>[0,1,2].map(i=>Number(v[prefix+i])),p=get('p'),m=get('m');
 if([p,m].some(([l,a,b])=>l<0||l>100||Math.abs(a)>200||Math.abs(b)>200)) throw new Error('L* debe estar entre 0 y 100. Revisa también a* y b*.');
 const d=differences(p,m), tolerance=Number(v.tolerance);
 if(tolerance<=0) throw new Error('La tolerancia debe ser mayor que cero.');
 const index=['ΔE 2000','ΔE 76','ΔE 94 (artes gráficas)','CMC (2:1)'].indexOf(v.method);
 const delta=d.e[Math.max(0,index)], signed=n=>(n>=0?'+':'')+n.toFixed(2);
 const result=$('.result',form);result.hidden=false;
 result.innerHTML='<strong>'+esc(v.method)+' '+delta.toFixed(2)+' · '+(delta<=tolerance?'Dentro de tolerancia':'Fuera de tolerancia')+'</strong><div class="comparison"><span style="--ink:'+labColor(p)+'" title="Patrón"></span><span style="--ink:'+labColor(m)+'" title="Muestra"></span></div>ΔL* '+signed(d.dl)+' · Δa* '+signed(d.da)+' · Δb* '+signed(d.db)+' · ΔC* '+signed(d.dc)+' · |ΔH*| '+d.dh.toFixed(2)+'<br>LCh patrón '+p[0].toFixed(2)+', '+d.c1.toFixed(2)+', '+d.h1.toFixed(2)+'° · muestra '+m[0].toFixed(2)+', '+d.c2.toFixed(2)+', '+d.h2.toFixed(2)+'°';
 return {...v,delta,tolerance,color:labColor(m),target:v.method+' · '+delta.toFixed(2),pattern:p,sample:m};
}
function simulation(){
 const options=byKind('mediciones').map(r=>'<option value="'+r.id+'">'+esc(r.title)+'</option>').join('');
 return heading('Simulador y corrección','Compara una prueba medida con su patrón antes de ajustar el lote.')+
 '<div class="form-actions lab-actions">'+btn('Buscar correcciones con mis tintas','data-view="igualacion"','spark')+'</div>'+'<form class="panel" id="simulate"><div class="form-grid"><label class="field">Medición guardada<select name="measurement" required><option value="">Seleccionar</option>'+options+'</select></label>'+field('change','Ajuste aplicado en la prueba')+'<div class="wide"><h3>Medición después del ajuste</h3><div class="form-grid">'+labFields('s')+'</div></div></div><p class="notice">Mide la prueba en las mismas condiciones. Sin caracterización compatible no hay base para estimar el efecto de añadir pigmento.</p><div class="form-actions"><button class="primary">Comparar prueba</button>'+btn('Guardar corrección','data-save-correction','check')+'</div><p class="error"></p><div class="result" hidden></div></form><div class="section-head"><h2>Correcciones guardadas</h2></div><section class="panel">'+(byKind('correcciones').map(recordRow).join('')||'<p class="empty">Aún no hay correcciones.</p>')+'</section>';
}
function simulate(form){
 if(!form.reportValidity())return;
 const v=formData(form),r=state.records.find(r=>r.id===Number(v.measurement));
 const adjusted=[v.s0,v.s1,v.s2].map(Number);
 if(adjusted[0]<0||adjusted[0]>100||adjusted.slice(1).some(n=>Math.abs(n)>200))throw new Error('Revisa los valores CIELAB de la prueba.');
 const method=['ΔE 2000','ΔE 76','ΔE 94 (artes gráficas)','CMC (2:1)'].indexOf(r.value.method);
 const delta=differences(r.value.pattern,adjusted).e[Math.max(method,0)];
 const result=$('.result',form);result.hidden=false;result.innerHTML='<div class="comparison">'+[r.value.pattern,r.value.sample,adjusted].map((lab,i)=>'<span style="--ink:'+labColor(lab)+'" title="'+['Patrón','Muestra inicial','Muestra ajustada'][i]+'"></span>').join('')+'</div>Patrón · Muestra inicial · Muestra ajustada<br>ΔE antes '+r.value.delta.toFixed(2)+' · ΔE después '+delta.toFixed(2)+' · '+(delta<=r.value.tolerance?'Dentro de tolerancia':'Fuera de tolerancia');
 return {measurement:r.id,adjusted,delta,change:v.change,color:labColor(adjusted),target:'ΔE '+delta.toFixed(2),title:r.title};
}
const lessons=[
 ['Teoría del color','El tono identifica la familia cromática, el croma indica su intensidad y L* describe la luminosidad.','¿Qué expresa L*?',['Luminosidad','Tono','Viscosidad']],
 ['Mezcla y neutralización','En mezcla aditiva se suman luces. Los pigmentos absorben parte del espectro. Una tinta complementaria puede reducir el croma, con un efecto dependiente del pigmento y la concentración.','¿Qué tipo de mezcla se aplica a pigmentos?',['Sustractiva','Aditiva','Especular']],
 ['Colorimetría aplicada','ΔE resume la diferencia entre muestras. Delta L*, a* y b* indican la dirección del cambio. Mide bajo el mismo iluminante, observador y condición M.','¿Qué señala ΔL* positivo para muestra menos patrón?',['Muestra más clara','Muestra más azul','Muestra más oscura']],
 ['Anilox y transferencia','El volumen de celda real y su obstrucción influyen en la película de tinta. Confirma el estado del rodillo antes de atribuir una variación a la fórmula.','¿Qué volumen describe mejor la condición actual?',['BCM real medido','BCM nominal','Ancho del rodillo']],
 ['Tintas base agua y UV','La evaporación y absorción influyen en el secado de base agua. En sistemas UV, el curado depende de la exposición, la formulación y las condiciones de impresión.','¿Qué proceso describe una tinta UV?',['Curado','Evaporación de agua','Sedimentación']]
];
function academy(){
 return heading('Academia','Explora los fundamentos de la tinta flexográfica y practica con ejercicios.')+lessons.map(([title,lesson,question,options],index)=>'<details class="panel lesson"><summary>'+title+(byKind('academia').some(r=>r.value.lesson===index)?' · Completada':'')+'</summary><p>'+lesson+'</p><form data-quiz="'+index+'"><label class="field">'+question+'<select name="answer" required><option value="">Selecciona una respuesta</option>'+[...options].sort().map(option=>'<option>'+option+'</option>').join('')+'</select></label><div class="form-actions"><button class="secondary">Comprobar respuesta</button></div><p class="error"></p></form></details>').join('')+'<section class="panel"><h2>Círculo cromático</h2><div class="form-actions"><div aria-hidden="true" style="width:100px;height:100px;flex:none;border-radius:50%;background:conic-gradient(red,#ff0,#0f0,#0ff,#00f,#f0f,red)"></div><label class="field">Ángulo de tono<input type="range" min="0" max="360" value="180" id="hue"></label><span id="hue-result"></span></div></section>';
}
const advice=[
 [/espuma/i,'Revisa la entrada de aire en la recirculación y la velocidad de agitación. Consulta la ficha del antiespumante compatible y documenta una prueba a escala pequeña.'],
 [/anilox|transfer|intensidad/i,'Compara el BCM real con el nominal. Inspecciona obstrucciones y confirma presión, viscosidad y velocidad con una prueba controlada antes de modificar la fórmula.'],
 [/curado|repinte|secado|adheren/i,'Identifica el sustrato, tratamiento, sistema de tinta y condiciones de impresión. Para UV verifica dosis y espectro con el método del fabricante. Registra el resultado de una prueba de adherencia.'],
 [/viscos|\bph\b/i,'Registra viscosidad, temperatura y método de medición. Para base agua contrasta el pH con la ficha del fabricante. Confirma compatibilidad y límites antes de ajustar.'],
 [/color|delta|metamer/i,'Mide patrón y muestra con el mismo iluminante, observador y condición M. Usa Colorimetría para identificar la dirección de la diferencia. Si sospechas metamerismo, compara ambos bajo más de un iluminante usando sus reflectancias.']
];
function assistant(){
 return heading('Asistente técnico','Consulta guías de diagnóstico para tintas y flexografía.')+'<section class="panel"><h2>Diagnóstico de laboratorio</h2><p class="notice">Guía local basada en temas. Describe el síntoma, la tinta, el sustrato y las condiciones de impresión.</p><div class="chat-output" aria-live="polite">'+state.chat.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div><form id="chat">'+field('question','Consulta','textarea','',true)+'<div class="form-actions"><button class="primary">Consultar</button></div></form></section>';
}
const calcTypes=[['masa','Porcentaje a gramos','Total (g)','Porcentaje (%)'],['bcm','Variación de aporte BCM','BCM nominal','BCM real'],['costo','Costo del lote','Cantidad (kg)','Costo por kg'],['balance','Balance después de corrección','Masa inicial (g)','Masa añadida (g)'],['dilucion','Dilución de una mezcla','Masa inicial (g)','Diluyente agregado (g)']];
function calculators(){
 const estimateFields=[['area','Área total del trabajo (m²)'],['bcm','BCM medido'],['coverage','Área cubierta por la tinta (%)'],['transfer','Transferencia medida o supuesta (%)'],['density','Densidad de tinta (g/cm³)'],['unitCost','Costo por kg (opcional)'],['labels','Etiquetas en el trabajo (opcional)']];
 return heading('Calculadoras','Resuelve escalados, costos, aportes de anilox y balances de masa.')+'<div class="tool-grid">'+
  calcTypes.map(([type,label,a,b])=>'<form class="panel" data-calc="'+type+'"><h2>'+label+'</h2><div class="form-grid" style="margin-top:12px">'+field('a',a,'number','',true)+field('b',b,'number','',true)+'</div><div class="form-actions"><button class="primary">Calcular</button></div><p class="error"></p><output class="result" hidden></output></form>').join('')+
  '<form class="panel" data-calc="bcm-volume"><h2>Capacidad geométrica del anilox</h2><div class="form-actions">'+field('a','BCM','number','',true)+'<button class="primary">Convertir</button></div><p class="error"></p><output class="result" hidden></output></form>'+
  '<form class="panel wide" data-calc="ink-estimate"><h2>Consumo teórico del trabajo</h2><p class="notice">Usa la transferencia medida o una hipótesis explícita. El resultado estima la tinta transferida y no incluye desperdicio ni carga de circuito.</p>'+
  '<div class="form-grid">'+estimateFields.map(([key,label],i)=>field(key,label,'number','',i<5)).join('')+'</div>'+
  '<div class="form-actions"><button class="primary">Estimar consumo</button></div><p class="error"></p><output class="result" hidden></output></form></div>';
}

function reports(){
 return heading('Historial y reportes','Consulta la actividad y exporta los datos de tu laboratorio.',btn('Imprimir / PDF','data-print','file'))+'<div class="form-actions" style="margin-bottom:15px">'+btn('Exportar JSON','data-export="json"','file','primary')+btn('Exportar CSV','data-export="csv"','file')+btn('Ver modificaciones','data-history','history')+'</div><section class="panel"><h2>Actividad reciente</h2>'+(state.records.map(recordRow).join('')||'<p class="empty">Aún no hay actividad.</p>')+'</section>';
}
function users(){return heading('Administración','Gestiona permisos y asignaciones del equipo.',btn('Generar código de acceso','data-invite','plus','primary'))+
 '<section class="panel" id="invitation-output" hidden aria-live="polite"></section><section class="panel" id="users-list"><p class="empty">Cargando usuarios…</p></section>';}
async function loadUsers(){
 const list=$('#users-list');
 try{
  const people=await api('users');
  list.innerHTML=people.map(person=>'<form class="record-row" data-user="'+person.id+'"><div><strong>'+esc(person.name)+'</strong><small>'+esc(person.email)+' · '+(person.fullAccess?'Acceso completo':'Comparar colores')+'</small></div>'+(person.id===state.user.id?statusTag(person.role):field('role','Rol',['administrador','supervisor','laboratorista','operador','estudiante'],person.role)+'<button class="secondary">Guardar</button>')+'</form>').join('');
 }catch(error){list.textContent=error.message;}
}
function auth(mode='login'){
 if(state.user){
  return modal('Mi perfil','<form id="profile-form"><div class="form-grid">'+field('name','Nombre','text',state.user.name,true)+field('theme','Tema',['dark','light'],state.theme)+'</div><p class="notice">'+esc(state.user.email)+' · '+esc(state.user.fullAccess?state.user.role:'Comparar colores')+'</p><div class="form-actions"><button class="primary">Guardar perfil</button>'+
   (state.user.role!=='administrador'?btn('Activar código de acceso','data-access'):'')+btn('Cerrar sesión','data-logout')+'</div><p class="error"></p></form>');
 }
 const title={login:'Iniciar sesión',register:'Crear cuenta',recover:'Recuperar contraseña',reset:'Cambiar contraseña'}[mode];
 $('#access-gate').innerHTML='<section class="access-card panel"><div class="brand access-brand"><span class="brand-icon"><i></i></span><span><strong>Color<span class="accent">L</span></strong><small>LABORATORIO DIGITAL</small></span></div><h1>'+title+'</h1><form id="auth-form" data-mode="'+mode+'"><div class="form-grid">'+
  (mode==='register'?field('name','Nombre','text','',true):'')+(mode!=='reset'?field('email','Correo electrónico','email','',true):field('key','Código recibido','text','',true))+
  (mode!=='recover'?field('password','Contraseña (mínimo 10 caracteres)','password','',true):'')+
  (mode==='register'?field('invite','Código de acceso al laboratorio (opcional)','password')+'</div><p class="notice">Puedes crear una cuenta sin código para comparar colores. Una invitación activa las herramientas del laboratorio.</p>':'</div>')+
  '<div class="form-actions"><button class="primary">'+title+'</button>'+ (mode==='login'?btn('Crear cuenta','data-auth="register"')+btn('Olvidé mi contraseña','data-auth="recover"','','text-button'):btn('Volver a iniciar sesión','data-auth="login"'))+(mode==='recover'?btn('Ya tengo un código','data-auth="reset"'):'')+'</div><p class="error" role="alert"></p></form></section>';
 const form=$('#auth-form');
 const email=form.elements.namedItem('email'), password=form.elements.namedItem('password');
 if(email)email.autocomplete='email';
 if(password){password.autocomplete=mode==='login'?'current-password':'new-password';password.minLength=10;password.maxLength=200;}
}
function accessModal(){
 if(!state.user)return;
 modal('Activar código de acceso','<form id="access-form">'+field('code','Código de acceso','password','',true)+'<div class="form-actions"><button class="primary">Activar código</button></div><p class="error" role="alert"></p></form>');
}
async function refresh(){
 state.records=state.user?.fullAccess ? await api('records') : [];
}
async function enterAccount(user,preferred=location.hash.slice(1)){
 state.user=user;
 state.theme=user.theme;
 localStorage.setItem('colorl-theme',state.theme);
 let failure;
 try{await refresh();}catch(error){state.records=[];failure=error.message;}
 const view=availableView(preferred)?preferred:defaultView();
 if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);
 navigate(view);
 if(failure)toast(failure);
}
async function save(record, view){
 if(!state.user){auth();return;}
 await api('records',record);await refresh();if(view)navigate(view);else render();toast('Registro guardado');
}
function search(){
 if(!state.user?.fullAccess)return;
 modal('Buscar en ColorL','<input id="global-query" type="search" placeholder="Colores, fórmulas, mediciones o módulos…" aria-label="Buscar"><div id="global-results"></div>');
 $('#global-query').focus();searchResults('');
}
function searchResults(term){
 const text=term.trim().toLowerCase();
 const modules=Object.entries(views).filter(([key,v])=>(key!=='usuarios'||state.user?.role==='administrador')&&v.label.toLowerCase().includes(text)).slice(0,8);
 const records=text?state.records.filter(r=>(r.title+' '+Object.values(r.value).join(' ')).toLowerCase().includes(text)).slice(0,10):[];
 $('#global-results').innerHTML=modules.map(([key,v])=>'<div class="record-row">'+I(v.icon)+btn(v.label,'data-view="'+key+'"','','text-button')+'</div>').join('')+records.map(r=>'<div class="record-row">'+swatch(r.value.color)+btn(r.title,schemas[r.kind]?'data-edit="'+r.id+'"':'data-view="'+r.kind+'"','','text-button')+'</div>').join('') || '<p class="empty">Sin resultados.</p>';
}
function download(filename,content,type){
 const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportRecords(type){
 if(!state.user)return auth();
 const data=await api('export');
 if(type==='json')return download('colorl-respaldo.json',JSON.stringify(data,null,2),'application/json');
 const csv=value=>'"'+String(value??'').replace(/^[\t\r\n ]*[=+\-@]/,"'$&").replaceAll('"','""')+'"';
 const lines=[['Tipo','Nombre','Estado','Actualización','Datos'],...data.records.map(r=>[r.kind,r.title,r.status,r.updated,JSON.stringify(r.value)])].map(row=>row.map(csv).join(','));
 download('colorl-registros.csv','\ufeff'+lines.join('\r\n'),'text/csv;charset=utf-8');
}
$('#workspace-icon').innerHTML=I('flask');$('#menu').innerHTML=I('menu');$('#notification').innerHTML=I('bell');$('#search').innerHTML=I('search')+'<span>Buscar en ColorL…</span><kbd>Ctrl K</kbd>';
document.addEventListener('click',async event=>{
 const el=event.target.closest('button');if(!el)return;
 try{
  const d=el.dataset;
  if(Object.keys(d).some(key=>key.startsWith('lab'))){
   el.disabled=true;
   try{if(await lab.click(el))return;}finally{el.disabled=el.dataset.saved==='true';}
  }
  if(d.inventoryOpen)return inventory.open(d.inventoryOpen);
  if(d.stockMovement)return await inventory.movement(d.stockMovement);
  if(d.view)return navigate(d.view);
  if(d.close!==undefined)return dialog.close();
  if(d.new)return await editor(d.new);
  if(d.edit){const r=state.records.find(r=>r.id===Number(d.edit));if(r)return await editor(r.kind,r);}
  if(d.auth)return auth(d.auth);
  if(d.access!==undefined)return accessModal();
  if(d.invite!==undefined){
   el.disabled=true;
   try{
    const {code,expires}=await api('invitations',{});
    const panel=$('#invitation-output');
    panel.hidden=false;
    panel.innerHTML='<h2>Código de acceso</h2><p class="notice">Compártelo con una persona. Tiene un solo uso y vence el '+esc(new Date(expires).toLocaleDateString('es-MX'))+'.</p>'+
     '<input readonly id="invitation-code" value="'+esc(code)+'" aria-label="Código generado">'+
     '<div class="form-actions">'+btn('Copiar código','data-copy-invite')+'</div>';
   }finally{el.disabled=false;}
   return;
  }
  if(d.copyInvite!==undefined){
   const field=$('#invitation-code');field.select();
   if(navigator.clipboard){await navigator.clipboard.writeText(field.value);toast('Código copiado');}
   return;
  }
  if(d.logout!==undefined){await flushDraft();await api('logout',{});state.user=null;state.chat=[];state.records=[];dialog.close();history.replaceState(null,'',location.pathname);render();return;}
  if(d.scale!==undefined){const form=$('#editor'),result=$('.result',form);$('.error',form).textContent='';result.innerHTML=recipe(formData(form));result.hidden=false;return;}
  if(d.saveMeasure!==undefined){const v=measure($('#measure'));if(v)await save({kind:'mediciones',title:v.title?.trim()||'Comparación de color',value:v,status:'Registrada'});return;}
  if(d.saveCorrection!==undefined){const v=simulate($('#simulate'));if(v)await save({kind:'correcciones',title:v.title,value:v,status:'Registrada'});return;}
  if(d.export)return await exportRecords(d.export);
  if(d.print!==undefined)return print();
  if(d.history!==undefined){
   if(!state.user)return auth();
   const data=await api('export');
   return modal('Historial de modificaciones',data.history.slice().reverse().map(h=>'<div class="record-row"><div><strong>'+esc(h.snapshot.title)+'</strong><small>'+esc(new Date(h.created).toLocaleString('es-MX'))+' · Usuario '+esc(h.actor)+'</small></div>'+statusTag(h.snapshot.status)+'</div>').join('')||'<p class="empty">Aún no hay modificaciones.</p>');
  }
  if(el.id==='search')return search();
  if(['profile','account'].includes(el.id))return auth();
  if(el.id==='menu'){const open=$('#sidebar').classList.toggle('open');el.setAttribute('aria-expanded',open);return;}
  if(el.id==='notification')return modal('Actividad reciente',state.records.slice(0,5).map(recordRow).join('')||'<p class="empty">Aún no hay actividad.</p>');
  if(el.id==='theme'){
   state.theme=state.theme==='light'?'dark':'light';
   localStorage.setItem('colorl-theme',state.theme);
   initializeTheme();
   if(state.view==='inicio'){resizeChart?.disconnect();chart();}
   if(state.user){
    el.disabled=true;
    try{state.user=(await api('profile',{name:state.user.name,theme:state.theme})).user;}
    finally{el.disabled=false;}
   }
  }
 }catch(error){const target=$('.error',el.closest('form')||document);if(target)target.textContent=error.message;else toast(error.message);}
});
document.addEventListener('submit',async event=>{
 const form=event.target;event.preventDefault();const data=formData(form), error=$('.error',form);
 if(error)error.textContent='';
 try{
  if(form.dataset.inventory){
   const button=event.submitter;
   if(button)button.disabled=true;
   try{await inventory.submit(form);}finally{if(button)button.disabled=false;}
   return;
  }
  if(form.dataset.lab){
   const button=event.submitter;
   if(button)button.disabled=true;
   try{await lab.submit(form);}finally{if(button)button.disabled=false;}
   return;
  }
  switch(form.id){
   case 'auth-form':{
    const button=event.submitter;
    if(button)button.disabled=true;
    try{
     const result=await api(form.dataset.mode,data);
     if(result.user)await enterAccount(result.user);
     else toast(result.message);
    }finally{if(button)button.disabled=false;}
    return;
   }
   case 'access-form':{
    const button=event.submitter;
    if(button)button.disabled=true;
    try{const {user}=await api('access',data);await enterAccount(user,'inicio');toast('Acceso actualizado');}
    finally{if(button)button.disabled=false;}
    return;
   }
   case 'profile-form':state.user=(await api('profile',data)).user;state.theme=state.user.theme;localStorage.setItem('colorl-theme',state.theme);dialog.close();render();toast('Perfil guardado');return;
   case 'editor':{
    const kind=form.dataset.kind, id=Number(form.dataset.id)||undefined, status=kind==='formulas'?event.submitter?.value||'Borrador':'Registrada';
    if(kind==='formulas' && status==='En revisión')recipe(data);
    await flushDraft();
    const {title,...fields}=data;
    const previous=state.records.find(r=>r.id===id)?.value;
    const value={...previous,...fields};if(kind==='colores')value.favorite=data.favorite==='on';
    if(kind==='inventario'){
     value.stockVerified=data.stockVerified==='on';
     if(value.minStock!==''&&(!Number.isFinite(Number(value.minStock))||Number(value.minStock)<0))throw new Error('El stock mínimo debe ser mayor o igual a cero.');
     if(value.stockVerified&&(!value.code.trim()||!value.lot.trim()||value.quantity==null||value.quantity===''||!value.expiry||!value.technology))
      throw new Error('Para confirmar el lote, indica código, lote, tecnología, existencia y fecha de caducidad.');
    }
    await save({id,kind,title,value,status},kind);return;
   }
   case 'measure':measure(form);return;
   case 'simulate':simulate(form);return;
   case 'chat':{
    const question=data.question.trim();if(!question)return;
    state.chat.push(question,advice.find(([pattern])=>pattern.test(question))?.[1]||'Registra el síntoma, la formulación, el sustrato y los parámetros actuales. Compáralos con una tirada estable e identifica una variable para comprobar en la siguiente prueba.');
    render();$('.chat-output').scrollTop=$('.chat-output').scrollHeight;return;
   }
  }
  if(form.dataset.user){await api('users',{id:Number(form.dataset.user),role:data.role});toast('Rol actualizado');return;}
  if(form.dataset.quiz!==undefined){
   const index=Number(form.dataset.quiz),[title,,,options]=lessons[index];
   if(data.answer!==options[0])throw new Error('Revisa la lección y vuelve a intentarlo.');
   if(state.user&&!byKind('academia').some(r=>r.value.lesson===index)){await save({kind:'academia',title,value:{lesson:index},status:'Completada'});return;}
   toast('Respuesta correcta');return;
  }
  if(form.dataset.calc==='ink-estimate'){
   const numeric=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,value===''?null:Number(value)]));
   const estimate=estimateInk(numeric), result=$('output',form);
   const format=value=>value.toLocaleString('es-MX',{maximumFractionDigits:4});
   const parts=[format(estimate.capacity)+' cm³/m² de capacidad',format(estimate.massPerArea)+' g/m² transferidos',format(estimate.kilograms)+' kg para el trabajo'];
   if(estimate.cost!=null)parts.push(format(estimate.cost)+' de costo');
   if(estimate.perThousand!=null)parts.push(format(estimate.perThousand)+' de costo por millar');
   result.hidden=false;result.textContent=parts.join(' · ');return;
  }
  if(form.dataset.calc==='bcm-volume'){
   const bcm=Number(data.a), result=$('output',form);
   if(!Number.isFinite(bcm)||bcm<0)throw new Error('El BCM debe ser mayor o igual a cero.');
   result.hidden=false;result.textContent=(bcm*BCM_TO_CM3_M2).toFixed(4)+' cm³/m² de capacidad geométrica';return;
  }
  if(form.dataset.calc){
   const a=Number(data.a),b=Number(data.b),type=form.dataset.calc;
   if(a<0||b<0||(['bcm','dilucion'].includes(type)&&a===0)||(type==='masa'&&b>100))throw new Error('Revisa el intervalo de los valores.');
   const [value,unit]=({masa:[a*b/100,'g'],bcm:[(b-a)*100/a,'% de variación'],costo:[a*b,'de costo'],balance:[a+b,'g'],dilucion:[100*a/(a+b),'% de mezcla inicial']})[type];
   const result=$('output',form);result.hidden=false;result.textContent=value.toFixed(3)+' '+unit;
  }
 }catch(problem){if(error)error.textContent=problem.message;else toast(problem.message);}
});
document.addEventListener('input',event=>{
 const el=event.target;
 const form=el.closest('#editor'), indicator=form && $('#draft-status',form);
 if(indicator){
  const content=formData(form);
  if(form.dataset.kind==='colores')content.favorite=content.favorite==='on';
  if(form.dataset.kind==='inventario')content.stockVerified=content.stockVerified==='on';
  draftPending={kind:form.dataset.kind,content,status:indicator};
  clearTimeout(draftTimer);
  draftTimer=setTimeout(flushDraft,550);
 }
 if(el.id==='global-query')searchResults(el.value);
 if(el.id==='filter'){
  const term=el.value.trim().toLowerCase();
  const rows=[...document.querySelectorAll('[data-filter]')];
  rows.forEach(row=>row.hidden=!row.dataset.filter.includes(term));
  $('#no-results').hidden=rows.some(row=>!row.hidden);
 }
 if(el.id==='hue')$('#hue-result').textContent=el.value+'° · Complementario '+((Number(el.value)+180)%360)+'°';
});
document.addEventListener('change',event=>{lab.change(event.target);if(event.target.id==='chart-days'){state.chartDays=Number(event.target.value);render();$('#chart-days').focus();}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}});
dialog.addEventListener('close',flushDraft);
window.addEventListener('popstate',()=>navigate(views[location.hash.slice(1)]?location.hash.slice(1):'inicio'));
const inventory=createInventory({state,esc,field,btn,modal,api,refresh,render,toast});
const lab=createLab({state,esc,field,heading,btn,modal,auth,api,refresh,render,toast,statusTag,delta:(pattern,sample)=>differences(pattern,sample).e[0]});
initializeTheme();
try{
 const result=await api('me');
 if(result.user)await enterAccount(result.user);
 else render();
}catch(error){render();toast(error.message);}
