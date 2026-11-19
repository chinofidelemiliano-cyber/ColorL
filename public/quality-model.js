const valid=value=>Number.isFinite(value)&&Math.abs(value)<=1e12;
export function readObservations(text){
 const fields=String(text??'').trim().split(/[\s,;]+/);
 const values=fields.map(Number);
 if(fields.some(field=>!field||!valid(Number(field)))||values.length<2||values.length>500)
  throw new Error('Ingresa de 2 a 500 observaciones numéricas en orden de medición, con decimales mediante punto.');
 return values;
}
export function individuals(values,{lower=null,upper=null,assumptions=false}={}){
 if(!Array.isArray(values)||values.length<2||values.length>500||values.some(value=>!valid(value)))throw new Error('Se requieren al menos dos observaciones válidas.');
 if((lower!==null&&!valid(lower))||(upper!==null&&!valid(upper))||(lower!==null&&upper!==null&&upper<=lower))
  throw new Error('Revisa los límites de especificación.');
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 const ranges=values.slice(1).map((value,i)=>Math.abs(value-values[i]));
 const rangeMean=ranges.reduce((a,b)=>a+b,0)/ranges.length;
 const sigma=rangeMean/1.128, lcl=mean-3*sigma,ucl=mean+3*sigma,mrUcl=3.267*rangeMean;
 const signals=values.flatMap((point,i)=>point<lcl||point>ucl?[i+1]:[]);
 const rangeSignals=ranges.flatMap((point,i)=>point>mrUcl?[i+2]:[]);
 const outside=values.filter(point=>(lower!==null&&point<lower)||(upper!==null&&point>upper)).length;
 let capability=null;
 if(assumptions&&values.length>=25&&sigma>0&&!signals.length&&!rangeSignals.length&&(lower!==null||upper!==null)){
  const cpu=upper===null?null:(upper-mean)/(3*sigma);
  const cpl=lower===null?null:(mean-lower)/(3*sigma);
  capability=cpu!==null&&cpl!==null?{cp:(upper-lower)/(6*sigma),cpk:Math.min(cpu,cpl),cpu,cpl}:{cpu,cpl};
 }
 return {mean,ranges,rangeMean,sigma,lcl,ucl,mrUcl,signals,rangeSignals,outside,capability};
}
export function pareto(records){
 const groups=new Map();
 for(const record of records){
  const label=String(record?.category??'').trim(), count=Number(record?.count);
  if(!label||!Number.isSafeInteger(count)||count<=0)throw new Error('Relaciona cada categoría con un número entero positivo.');
  const key=label.toLocaleLowerCase('es-MX'), previous=groups.get(key);
  groups.set(key,{label:previous?.label||label,count:(previous?.count||0)+count});
 }
 const sorted=[...groups.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es-MX'));
 const total=sorted.reduce((sum,item)=>sum+item.count,0);
 if(!sorted.length||!Number.isSafeInteger(total))throw new Error('Ingresa categorías y frecuencias válidas.');
 let running=0;
 return sorted.map(item=>{running+=item.count;return {...item,percentage:item.count/total*100,cumulative:running/total*100};});
}
