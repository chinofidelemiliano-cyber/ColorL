const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const sd=values=>Math.sqrt(values.reduce((sum,x)=>sum+(x-mean(values))**2,0)/(values.length-1));
const valid=v=>Number.isFinite(v)&&Math.abs(v)<=1e12;
const constants={
 2:[1.128,.853,.79788456],3:[1.693,.888,.88622693],4:[2.059,.880,.92131773],5:[2.326,.864,.93998560],
 6:[2.534,.848,.95153286],7:[2.704,.833,.95936879],8:[2.847,.820,.96503046],9:[2.970,.808,.96931070],10:[3.078,.797,.97265927]
};
export const chartTypes=['X̄–R','X̄–S','P','NP','C','U'];
export function parseSubgroups(text){
 const rows=String(text??'').trim().split(/\r?\n/).filter(line=>line.trim()).map(line=>line.trim().split(/[ ,;\t]+/).map(Number));
 if(rows.length<2||rows.length>250||rows.some(row=>!row.length||row.length>10||row.some(v=>!valid(v))))
  throw new Error('Registra de 2 a 250 subgrupos, uno por línea, con decimales mediante punto.');
 return rows;
}
function curve(name,points,center,spread,limits=null){
 const upper=limits?.upper??points.map((_,i)=>center+3*spread[i]);
 const lower=limits?.lower??points.map((_,i)=>center-3*spread[i]);
 return {name,points,center,lower,upper,signals:points.flatMap((v,i)=>v>upper[i]||v<lower[i]?[i+1]:[])};
}
function specs(values,within,opts,unstable,count){
 const {lower=null,upper=null,assumptions=false}=opts;
 if((lower!==null&&!valid(lower))||(upper!==null&&!valid(upper))||(lower!==null&&upper!==null&&upper<=lower))throw new Error('Revisa los límites de especificación.');
 const average=mean(values), overall=sd(values);
 if(!assumptions||unstable||count<25||lower===null||upper===null||within<=0||overall<=0)return null;
 return {cp:(upper-lower)/(6*within),cpk:Math.min(upper-average,average-lower)/(3*within),
  pp:(upper-lower)/(6*overall),ppk:Math.min(upper-average,average-lower)/(3*overall)};
}
export function spc(rows,type,opts={}){
 if(!chartTypes.includes(type)||!Array.isArray(rows)||rows.length<2||rows.length>250||rows.some(row=>!Array.isArray(row)||!row.length||row.some(v=>!valid(v))))throw new Error('Ingresa subgrupos válidos.');
 if(type.startsWith('X')){
  const n=rows[0].length, factors=constants[n];
  if(!factors||rows.some(row=>row.length!==n))throw new Error('Usa subgrupos de 2 a 10 lecturas, todos del mismo tamaño.');
  const [d2,d3,c4]=factors, means=rows.map(mean);
  const range=type==='X̄–R', stats=rows.map(row=>range?Math.max(...row)-Math.min(...row):sd(row));
  const center=mean(stats), sigma=center/(range?d2:c4);
  const spread=(range?d3:Math.sqrt(1-c4*c4))*sigma, limits=x=>stats.map(()=>x);
  const main=curve('Medias de subgrupo',means,mean(means),limits(sigma/Math.sqrt(n)));
  const dispersion=curve(range?'Rangos':'Desviaciones estándar',stats,center,limits(spread),{
   lower:limits(Math.max(0,center-3*spread)),upper:limits(center+3*spread)});
  const capability=specs(rows.flat(),sigma,opts,main.signals.length||dispersion.signals.length,rows.length);
  return {charts:[main,dispersion],capability};
 }
 const counts=rows.map(row=>row[0]), samples=rows.map(row=>row[1]);
 const one=type==='C',binomial=type==='P'||type==='NP';
 if(rows.some(row=>row.length!==(one?1:2)||!Number.isSafeInteger(row[0])||row[0]<0||
  (!one&&(!Number.isSafeInteger(row[1])||row[1]<=0||(binomial&&row[0]>row[1])))))throw new Error(one?'Usa un recuento entero por línea.':'Usa recuento y unidades inspeccionadas por línea. En P y NP registra unidades defectuosas.');
 if(type==='NP'&&samples.some(n=>n!==samples[0]))throw new Error('NP requiere tamaños iguales. Usa P para tamaños variables.');
 const pooled=one?mean(counts):counts.reduce((a,b)=>a+b,0)/samples.reduce((a,b)=>a+b,0);
 const points=type==='P'||type==='U'?counts.map((x,i)=>x/samples[i]):counts;
 const center=type==='NP'?pooled*samples[0]:pooled, spread=counts.map((_,i)=>one?Math.sqrt(center):
  type==='U'?Math.sqrt(center/samples[i]):type==='NP'?Math.sqrt(samples[i]*pooled*(1-pooled)):Math.sqrt(pooled*(1-pooled)/samples[i]));
 const maximum=type==='P'?1:type==='NP'?samples[0]:Infinity;
 const main=curve(type,points,center,spread,{lower:spread.map(s=>Math.max(0,center-3*s)),upper:spread.map(s=>Math.min(maximum,center+3*s))});
 return {charts:[main],capability:null,smallCounts:binomial?samples.some(n=>n*pooled<5||n*(1-pooled)<5):pooled===0};
}

export function histogram(values, bins){
 if(!Array.isArray(values)||values.length<2||values.some(v=>!valid(v))||!Number.isInteger(bins)||bins<2||bins>30)throw new Error('Ingresa al menos dos valores y de 2 a 30 clases.');
 const min=Math.min(...values),max=Math.max(...values);
 if(min===max)return [{from:min,to:max,count:values.length}];
 const width=(max-min)/bins;
 const groups=Array.from({length:bins},(_,i)=>({from:min+i*width,to:i===bins-1?max:min+(i+1)*width,count:0}));
 for(const value of values)groups[Math.min(bins-1,Math.floor((value-min)/width))].count++;
 return groups;
}
export function scatter(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.some(row=>row.length!==2||row.some(v=>!valid(v))))throw new Error('Ingresa pares X Y, uno por línea.');
 const x=mean(rows.map(row=>row[0])),y=mean(rows.map(row=>row[1]));
 const stats=rows.reduce(([xx,yy,xy],row)=>[xx+(row[0]-x)**2,yy+(row[1]-y)**2,xy+(row[0]-x)*(row[1]-y)],[0,0,0]);
 const [xx,yy,xy]=stats;
 return {r:xx>0&&yy>0?xy/Math.sqrt(xx*yy):null};
}
export function parseGage(text){
 const rows=String(text??'').trim().split(/\r?\n/).filter(line=>line.trim()).map(line=>line.split(';').map(v=>v.trim()));
 if(rows.length<8||rows.length>2000||rows.some(row=>row.length!==3||row.some(value=>!value)||!valid(Number(row[2]))))
  throw new Error('Usa una línea por lectura con pieza;operador;valor. Registra entre 8 y 2,000 lecturas.');
 return rows.map(([part,operator,value])=>[part,operator,Number(value)]);
}
export function gage(rows){
 if(!Array.isArray(rows)||rows.length<8||rows.length>2000||rows.some(([part,operator,value])=>typeof part!=='string'||!part||typeof operator!=='string'||!operator||!valid(value)))
  throw new Error('Verifica las columnas pieza, operador y valor.');
 const parts=[...new Set(rows.map(row=>row[0]))],operators=[...new Set(rows.map(row=>row[1]))];
 const p=parts.length,o=operators.length,r=rows.length/(p*o);
 if(p<2||o<2||!Number.isInteger(r)||r<2)throw new Error('Usa un diseño cruzado balanceado con al menos 2 piezas, 2 operadores y 2 repeticiones por combinación.');
 const cells=parts.map(part=>operators.map(operator=>rows.filter(row=>row[0]===part&&row[1]===operator).map(row=>row[2])));
 if(cells.some(group=>group.some(cell=>cell.length!==r)))throw new Error('Cada operador debe medir cada pieza el mismo número de veces.');
 const average=mean(rows.map(row=>row[2])),means=cells.map(group=>group.map(mean));
 const partMean=means.map(mean),operatorMean=operators.map((_,i)=>mean(means.map(group=>group[i])));
 const sq=x=>x*x, sum=values=>values.reduce((a,b)=>a+b,0);
 const msE=sum(cells.flatMap((group,i)=>group.flatMap((cell,j)=>cell.map(value=>sq(value-means[i][j])))))/(p*o*(r-1));
 const msI=r*sum(means.flatMap((group,i)=>group.map((value,j)=>sq(value-partMean[i]-operatorMean[j]+average))))/((p-1)*(o-1));
 const msO=p*r*sum(operatorMean.map(value=>sq(value-average)))/(o-1);
 const msP=o*r*sum(partMean.map(value=>sq(value-average)))/(p-1);
 const raw={repetibilidad:msE,operador:(msO-msI)/(p*r),interaccion:(msI-msE)/r,pieza:(msP-msI)/(o*r)};
 const components=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,Math.max(0,value)]));
 const gauge=components.repetibilidad+components.operador+components.interaccion,total=gauge+components.pieza;
 return {p,o,r,components,gauge,studyPercent:total?100*Math.sqrt(gauge/total):null,roundedToZero:Object.keys(raw).filter(key=>raw[key]<0)};
}
