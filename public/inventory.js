import {readInventoryPdf} from './inventory-import.js';
import {encodeFile} from './catalog-import.js';

export function createInventory({state,esc,field,btn,modal,api,refresh,render,toast}){
 const pending=new WeakMap();
 const canEdit=()=>state.user?.fullAccess&&!['operador','estudiante'].includes(state.user.role);
 const own=(kind,id)=>state.records.find(r=>r.kind===kind&&r.id===Number(id)&&r.owner===state.user?.id);
 const original=source=>'<a class="text-button" href="/api/catalog-source?id='+encodeURIComponent(source)+'">Descargar PDF</a>';
 const error='<p class="error" role="alert"></p>';
 const notice=text=>'<p class="notice">'+esc(text)+'</p>';
 const kg=amount=>Number(amount).toLocaleString('es-MX',{maximumFractionDigits:6})+' kg';
 function documentLinks(kind){
  const documents=state.records.filter(r=>r.kind==='catalogos'&&r.value.importKind===kind&&r.owner===state.user?.id);
  if(!documents.length)return '';
  return '<div class="section-head"><h2>PDF importados</h2></div><section class="panel">'+documents.map(r=>'<div class="record-row"><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.value.count)+' registros nuevos</small></div>'+original(r.value.source)+'</div>').join('')+'</section>';
 }
 function review(form,kind,items,file){
  if(!items.length)throw new Error('El archivo no contiene filas reconocibles.');
  pending.set(form,{kind,items,file});form.dataset.inventory='commit';
  const headings=kind==='anilox'?['Código','Lineatura','BCM nominal','Aporte según PDF','Material','Observaciones']:['Tinta','Código','Lote','Proveedor','Existencia reportada','Costo/kg'];
  const cells=kind==='anilox'?item=>[item.code,item.lineature,item.nominal,item.sourceAporte,item.material,item.notes]:
   item=>[item.title,item.code,item.lot,item.supplier,kg(item.quantity)+(item.quantity<0?' · requiere revisión':''),item.cost];
  form.innerHTML=notice(items.length+' filas detectadas. Desmarca las filas que no quieras importar.')+
   (kind==='anilox'?notice('La columna Aporte real del PDF se conserva por separado. Completa BCM medido al verificar sus unidades.'):
    notice('Estas existencias pertenecen a la fecha del documento. Los saldos negativos se guardan como observación, con existencia pendiente de corregir. Confirma los lotes antes de usarlos en el formulador.'))+
   '<div class="table-scroll inventory-review"><table class="table"><thead><tr><th>Incluir</th>'+headings.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
   items.map((item,index)=>'<tr><td><input type="checkbox" name="selection" value="'+index+'" checked aria-label="Incluir '+esc(item.code+' '+(item.lot||''))+'"></td>'+
    cells(item).map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
   (kind==='inventario'?field('addToCatalog','Añadir códigos nuevos al catálogo de tintas','checkbox',true):'')+
   '<div class="form-actions"><button class="primary">Confirmar importación</button></div>'+error;
 }
 function open(kind){
  if(!canEdit()||!['anilox','inventario'].includes(kind))return;
  modal(kind==='anilox'?'Importar PDF de anilox':'Importar PDF de lotes','<form data-inventory="read" data-kind="'+kind+'">'+
   '<label class="field">PDF original<input type="file" name="file" accept=".pdf,application/pdf" required></label>'+
   notice('Usa el formato '+(kind==='anilox'?'de dos páginas con la tabla y sus notas.':'de cuatro páginas con lotes, existencias y costos.'))+
   '<div class="form-actions"><button class="primary">Revisar archivo</button></div>'+error+'</form>',true);
 }
 async function submit(form){
  if(!canEdit())throw new Error('Tu rol no permite modificar este inventario.');
  const input=new FormData(form);
  if(form.dataset.inventory==='read'){
   const file=input.get('file'),kind=form.dataset.kind;
   review(form,kind,await readInventoryPdf(file,kind),file);return;
  }
  if(form.dataset.inventory==='commit'){
   const {kind,items,file}=pending.get(form);
   const selected=input.getAll('selection').map(index=>items[Number(index)]);
   if(!selected.length)throw new Error('Selecciona al menos una fila.');
   const result=await api('inventory-import',{kind,items:selected,addToCatalog:input.get('addToCatalog')==='on',filename:file.name,data:await encodeFile(file)});
   await refresh();document.querySelector('#dialog').close();render();
   toast(result.count+' registros importados · '+result.skipped+' duplicados omitidos'+(result.catalogCount?' · '+result.catalogCount+' códigos nuevos en el catálogo':''));return;
  }
  if(form.dataset.inventory==='movement'){
   const quantity=Number(input.get('quantity'));
   if(!Number.isFinite(quantity)||quantity<.000001)throw new Error('Ingresa una cantidad mayor o igual a 0.000001 kg.');
   await api('stock-movement',{id:Number(form.dataset.id),amount:input.get('direction')==='Entrada'?quantity:-quantity,reason:input.get('reason')});
   await refresh();render();await movement(form.dataset.id);toast('Movimiento guardado');
  }
 }
 async function movement(id){
  const r=own('inventario',id)||own('preparados',id);
  if(!r)return;
  const entries=await api('stock-movement?id='+id);
  const history=entries.map(entry=>'<div class="record-row"><div><strong>'+esc(entry.reason)+'</strong><small>'+esc(new Date(entry.created).toLocaleString('es-MX'))+' · saldo '+kg(entry.quantity)+'</small></div>'+esc((entry.amount>0?'+':'')+kg(entry.amount))+'</div>').join('');
  modal('Movimientos · '+r.title,notice('Lote '+(r.value.lot||'sin identificación')+' · saldo '+(r.value.quantity==null||r.value.quantity===''?'sin registrar':kg(r.value.quantity)))+
   (canEdit()?'<form data-inventory="movement" data-id="'+r.id+'"><div class="form-grid">'+field('direction','Tipo',['Entrada','Salida'])+field('quantity','Cantidad (kg)','number','',true)+
    field('reason','Motivo o trabajo','text','',true)+'</div><div class="form-actions"><button class="primary">Registrar movimiento</button></div>'+error+'</form>':'')+
   '<div class="section-head"><h2>Historial del lote</h2></div>'+(history||notice('Todavía no hay movimientos.')));
 }
 return {open,submit,movement,documentLinks,original,canEdit};
}
