export const normalize = text => String(text ?? '').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export const technologies = ['Base agua','UV','Base solvente'];
export const symptoms = ['Viscosidad','pH','Adherencia','Concentración','Transferencia','Secado','Curado'];
export const positive = (value,label) => {
 const number=Number(value);
 if(!Number.isFinite(number)||number<=0)throw new Error(label+' debe ser mayor que cero.');
 return number;
};
export function parseLab(text){
 const parts=String(text ?? '').trim().split(/[\s,;]+/);
 const lab=parts.map(Number);
 if(parts.length!==3||parts.some(value=>!value)||lab.some(n=>!Number.isFinite(n))||lab[0]<0||lab[0]>100||lab.slice(1).some(n=>Math.abs(n)>200))
  throw new Error('Escribe tres valores CIELAB en el formato L*, a*, b* (decimales con punto).');
 return lab;
}
export function readLab(text,mode){
 if(mode!=='CIELCh')return parseLab(text);
 const parts=String(text ?? '').trim().split(/[\s,;]+/),[l,c,h]=parts.map(Number);
 if(parts.length!==3||[l,c,h].some(n=>!Number.isFinite(n))||l<0||l>100||c<0||c>200||h<0||h>360)
  throw new Error('Escribe tres valores CIELCh válidos en el formato L*, C*, h°.');
 const angle=h*Math.PI/180;
 return [l,c*Math.cos(angle),c*Math.sin(angle)];
}
export function spectrum(text){
 if(!String(text||'').trim())return [];
 const curve=String(text).trim().split(/\n+/).map(line=>line.trim().split(/[\s,;]+/));
 if(curve.some(pair=>pair.length!==2||pair.some(x=>x===''||!Number.isFinite(Number(x)))))throw new Error('Escribe una longitud de onda y un porcentaje por línea.');
 const points=curve.map(pair=>pair.map(Number)).sort((a,b)=>a[0]-b[0]);
 if(points.some(([w,r],i)=>w<360||w>830||r<0||r>100||(i>0&&w===points[i-1][0])))throw new Error('La reflectancia debe estar entre 0 y 100 % y cada longitud de onda entre 360 y 830 nm debe aparecer una sola vez.');
 return points;
}
export function mixture(text,inks){
 const lines=String(text||'').trim().split(/\n+/).filter(Boolean);
 if(!lines.length)throw new Error('Registra los componentes y sus gramos, uno por línea.');
 const seen=new Set();
 return lines.map(line=>{
  const index=line.lastIndexOf(':'), code=normalize(line.slice(0,index)), grams=positive(line.slice(index+1).trim(),'Los gramos');
  const matches=inks.filter(ink=>normalize(ink.value.code)===code);
  if(index<1||matches.length!==1||seen.has(matches[0].id))throw new Error('Cada código debe identificar una tinta activa y aparecer una sola vez. Revisa «'+line+'».');
  const id=matches[0].id;seen.add(id);
  return {id,grams};
 });
}
const total = parts => parts.reduce((sum,part)=>sum+part.grams,0);
export const scale = (parts,grams) => {
 const original=total(parts);
 return parts.map(part=>({id:part.id,grams:grams*part.grams/original,percent:100*part.grams/original}));
};
export const processFields=[
 ['substrateColor','Color del sustrato','text'],['opacity','Opacidad del sustrato (%)','number',0,100],
 ['surfaceEnergy','Tratamiento (dinas/cm)','number',0],['lineature','Lineatura','number',1],
 ['nominalBcm','BCM nominal','number',0],['speed','Velocidad de impresión (m/min)','number',0],
 ['viscosity','Viscosidad (valor, unidad y copa)','text'],['ph','pH','number',0,14],
 ['temperature','Temperatura de tinta (°C)','number',-50,100],['machine','Máquina o banco de prueba','text'],
 ['transfer','Transferencia medida (%)','number',0,100],['film','Película medida (µm)','number',0],
 ['plate','Placa y cinta','text'],['pressure','Presión, punto de ajuste y unidad','text'],
 ['drying','Secado o curado documentado','text'],['finishing','Blanco de respaldo, barniz o laminado','text'],
 ['sequence','Orden de impresión y trapping','text']
];
export function context(input){
 const result={};
 for(const key of ['technology','substrate','anilox','condition','illuminant']){
  result[key]=String(input[key]||'').trim();
  if(!result[key])throw new Error('Completa el sustrato, el anilox y las condiciones de medición.');
 }
 if(!technologies.includes(result.technology))throw new Error('Selecciona una tecnología válida.');
 result.bcm=positive(input.bcm,'El BCM real');
 for(const [key,label,type,min,max] of processFields){
  const raw=String(input[key]??'').trim();
  if(!raw)continue;
  const parsed=type==='number'?Number(raw):raw;
  if(type==='number'&&(!Number.isFinite(parsed)||parsed<min||(max!=null&&parsed>max)))throw new Error(label+' está fuera del intervalo válido.');
  result[key]=parsed;
 }
 return result;
}
function compatible(left,right){
 return ['technology','substrate','anilox','condition','illuminant'].every(key=>normalize(left?.[key])===normalize(right[key]))&&Math.abs(left.bcm-right.bcm)<1e-8&&
  processFields.every(([key])=>right[key]==null||(left?.[key]!=null&&normalize(left[key])===normalize(right[key])));
}
const matchingParts=(parts,inks,conditions)=>Array.isArray(parts)&&parts.length>0&&parts.every(part=>Number.isFinite(part.grams)&&part.grams>0&&inks.some(ink=>ink.id===part.id&&normalize(ink.value.technology)===normalize(conditions.technology)));
const allAvailable=(parts,inks,conditions)=>matchingParts(parts,inks.filter(ink=>ink.value.available!==false),conditions);
const validLab=lab=>Array.isArray(lab)&&lab.length===3&&lab.every(Number.isFinite)&&lab[0]>=0&&lab[0]<=100&&lab.slice(1).every(value=>Math.abs(value)<=200);
function enoughStock(parts,inks){
 return parts.every(part=>{
  const stock=inks.find(ink=>ink.id===part.id)?.value.stockGrams;
  return stock==null||stock===''||(Number.isFinite(Number(stock))&&Number(stock)+1e-8>=part.grams);
 });
}
export function formulations(trials,inks,{target,conditions,batch,tolerance},delta){
 const groups=new Map();
 for(const record of trials){
  const {value:v}=record;
  if(v.verified!==true||v.mode!=='mezcla'||!compatible(v.conditions,conditions)||!validLab(v.after)||!allAvailable(v.parts,inks,conditions))continue;
  const parts=scale(v.parts,batch);
  if(!enoughStock(parts,inks))continue;
  const key=parts.map(part=>part.id+':'+part.percent.toFixed(5)).join('|');
  const distance=delta(target,v.after);
  if(!Number.isFinite(distance))continue;
  const existing=groups.get(key);
  if(existing){
   existing.count++;
   existing.delta=Math.max(existing.delta,distance);
   existing.best=Math.min(existing.best,distance);
   if(record.approvedFormula&&!existing.record.approvedFormula)existing.record=record;
  }else groups.set(key,{record,parts,delta:distance,best:distance,count:1});
 }
 const validated=candidate=>Boolean(candidate.record.approvedFormula && Number.isFinite(tolerance) && candidate.delta<=tolerance);
 return [...groups.values()].sort((a,b)=>Number(validated(b))-Number(validated(a))||a.delta-b.delta||b.count-a.count).slice(0,5);
}

const signature=parts=>scale(parts,100).map(p=>[p.id,p.percent]);
function sameRecipe(left,right){
 if(left.length!==right.length)return false;
 const a=signature(left),b=signature(right);
 return a.every(([id,pct],i)=>id===b[i][0]&&Math.abs(pct-b[i][1])<0.001);
}
export function corrections(trials,inks,{target,current,conditions,parts},delta){
 const baseline=delta(target,current), mass=total(parts);
 if(!matchingParts(parts,inks,conditions))return [];
 const groups=new Map();
 for(const record of trials){
  const v=record.value;
  if(v.verified!==true||v.mode!=='ajuste'||!compatible(v.conditions,conditions)||!validLab(v.before)||!validLab(v.after)||
    !matchingParts(v.parts,inks,conditions)||!allAvailable(v.additions,inks,conditions)||!sameRecipe(parts,v.parts)||delta(current,v.before)>1)continue;
  const signature=v.additions.map(part=>part.id+':'+(part.grams/total(v.parts)).toFixed(7)).join('|');
  const estimated=current.map((value,i)=>value+v.after[i]-v.before[i]);
  const score=validLab(estimated)?delta(target,estimated):Infinity;
  const group=groups.get(signature)||{record,outcomes:[]};
  group.outcomes.push({estimated,score});
  groups.set(signature,group);
 }
 return [...groups.values()].flatMap(({record,outcomes})=>{
  const worst=Math.max(...outcomes.map(o=>o.score)),best=Math.min(...outcomes.map(o=>o.score));
  if(worst>=baseline)return [];
  const estimated=current.map((_,i)=>outcomes.reduce((sum,o)=>sum+o.estimated[i],0)/outcomes.length),score=delta(target,estimated);
  const add=record.value.additions.map(part=>({id:part.id,grams:part.grams*mass/total(record.value.parts)}));
  if(!enoughStock(add,inks))return [];
  const final=new Map(parts.map(part=>[part.id,part.grams]));
  for(const part of add)final.set(part.id,(final.get(part.id)||0)+part.grams);
  const reduced=scale([...final].map(([id,grams])=>({id,grams})),mass).map(part=>({...part,difference:part.grams-(parts.find(p=>p.id===part.id)?.grams||0)}));
  const risks=estimated.flatMap((v,i)=>Math.abs(v-target[i])>Math.abs(current[i]-target[i])+.01?[['L*','a*','b*'][i]]:[]);
  return [{record,score,estimated,add,reduced,best,worst,count:outcomes.length,risks}];
 }).sort((a,b)=>a.worst-b.worst||b.count-a.count).slice(0,5);
}
export function diagnostic(inks,input){
 const mass=positive(input.batch,'La masa del lote');
 const candidates=inks.filter(({value:v})=>v.available!==false&&v.manufacturerVerified===true&&normalize(v.technology)===normalize(input.technology)&&
   normalize(v.application)===normalize(input.application)&&normalize(v.compatibility).split(/[,;\n]/).some(x=>x.trim()===normalize(input.family))&&
   normalize(v.diagnosisDirection)===normalize(input.direction)&&normalize(v.substrates).split(/[,;\n]/).some(x=>x.trim()===normalize(input.substrate))&&
   v.procedure&&v.risks&&v.reference&&v.doseMin!==''&&v.doseMax!==''&&v.doseMin!=null&&v.doseMax!=null)
  .map(ink=>({ink,min:Number(ink.value.doseMin),max:Number(ink.value.doseMax)}))
  .filter(({min,max})=>Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min&&max<=100&&max>0)
  .map(product=>({...product,minGrams:mass*product.min/100,maxGrams:mass*product.max/100}));
 return candidates.filter(product=>enoughStock([{id:product.ink.id,grams:product.maxGrams}],inks));
}

// Confirmed lots take precedence over a manually entered catalog balance.
export function linkInventory(inks,lots,today=new Date().toISOString().slice(0,10)){
 return inks.map(ink=>{
  const related=lots.filter(lot=>normalize(lot.value.code)===normalize(ink.value.code)&&
   normalize(lot.value.technology)===normalize(ink.value.technology)&&lot.value.stockVerified===true);
  if(!related.length)return ink.value.requiresVerifiedLots?{...ink,value:{...ink.value,available:false,stockGrams:0}}:ink;
  const usable=related.filter(lot=>/^\d{4}-\d{2}-\d{2}$/.test(lot.value.expiry||'')&&lot.value.expiry>=today&&Number(lot.value.quantity)>0);
  const grams=usable.reduce((total,lot)=>total+1000*Number(lot.value.quantity),0);
  return {...ink,value:{...ink.value,available:ink.value.available!==false&&grams>0,stockGrams:grams,verifiedLots:usable}};
 });
}
export function lotCost(parts,inks){
 let currency, amount=0;
 for(const part of parts){
  const lots=inks.find(ink=>ink.id===part.id)?.value.verifiedLots;
  if(!lots?.length)return null;
  let grams=part.grams;
  for(const {value:lot} of [...lots].sort((a,b)=>a.value.expiry.localeCompare(b.value.expiry))){
   if(grams<=1e-8)break;
   const unit=Number(lot.cost);
   if(!lot.currency||lot.cost==null||lot.cost===''||!Number.isFinite(unit)||unit<0||(currency&&currency!==lot.currency))return null;
   currency=lot.currency;
   const used=Math.min(grams,1000*Number(lot.quantity));
   amount+=used*unit/1000;grams-=used;
  }
  if(grams>1e-8)return null;
 }
 return currency?{currency,amount}:null;
}
