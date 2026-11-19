const fail=message=>{throw new Error(message);};
export function kubelkaMunk(percent){
 if(!Number.isFinite(percent)||percent<=0||percent>100)fail('Kubelka–Munk requiere reflectancias mayores que 0 y de hasta 100 %.');
 const r=percent/100;
 return (1-r)**2/(2*r);
}
export function reflectanceFromKS(value){
 if(!Number.isFinite(value)||value<0)fail('K/S debe ser mayor o igual a cero.');
 return 100/(1+value+Math.sqrt(value**2+2*value));
}
function wavelengthGrid(wavelengths){
 if(!Array.isArray(wavelengths)||wavelengths.length<8||wavelengths.length>150||
  wavelengths[0]>400||wavelengths.at(-1)<700||
  wavelengths.some((nm,i)=>!Number.isFinite(nm)||nm<360||nm>830||(i&&(nm<=wavelengths[i-1]||nm-wavelengths[i-1]>50))))
  fail('Usa una malla ordenada que cubra 400–700 nm, con al menos 8 puntos y pasos de hasta 50 nm.');
}
export function validateSeries(series){
 if(!series||!Array.isArray(series.samples))fail('La serie de calibración está incompleta.');
 const {wavelengths,samples}=series;
 wavelengthGrid(wavelengths);
 if(samples.length<2||samples.length>16)fail('Incluye entre 2 y 16 concentraciones medidas.');
 if(samples.some((s,i)=>!s||!Number.isFinite(s.concentration)||s.concentration<0||s.concentration>100||
  (i>0&&s.concentration<=samples[i-1].concentration)||!Array.isArray(s.values)||s.values.length!==wavelengths.length))
  fail('Usa concentraciones distintas y ordenadas, y mide todas las longitudes de onda en cada muestra.');
 for(const sample of samples)sample.values.forEach(kubelkaMunk);
 return series;
}
const list=line=>line.split(/[;,\s]+/).filter(Boolean);
export function parseCalibration(text){
 const [header,...rows]=String(text??'').trim().split(/\n+/).map(line=>list(line.trim()));
 if(!header||!/^(nm|λ|longitud)$/i.test(header[0]||''))fail('La primera fila debe comenzar con nm y las concentraciones en porcentaje.');
 const samples=header.slice(1).map(concentration=>({concentration:Number(concentration),values:[]}));
 const wavelengths=[];
 for(const row of rows){
  if(row.length!==samples.length+1)fail('Cada fila debe tener una longitud de onda y una reflectancia por concentración.');
  wavelengths.push(Number(row[0]));
  samples.forEach((sample,i)=>sample.values.push(Number(row[i+1])));
 }
 return validateSeries({wavelengths,samples});
}
export function spectralFit(series,target,accept=()=>true){
 validateSeries(series);
 if(!Array.isArray(target)||target.length!==series.wavelengths.length||
  target.some((pair,i)=>!Array.isArray(pair)||pair[0]!==series.wavelengths[i]||!Number.isFinite(pair[1])||pair[1]<0||pair[1]>100))
  fail('El patrón y la serie deben usar exactamente la misma malla espectral y reflectancia en porcentaje.');
 const wavelengths=series.wavelengths, targetValues=target.map(pair=>pair[1]);
 const score=values=>Math.sqrt(values.reduce((sum,r,i)=>sum+(r-targetValues[i])**2,0)/values.length);
 let observed=null,predicted=null;
 for(const sample of series.samples){
  if(!accept(sample.concentration))continue;
  const rms=score(sample.values);
  if(!observed||rms<observed.rms)observed={...sample,rms};
 }
 for(let i=1;i<series.samples.length;i++){
  const left=series.samples[i-1],right=series.samples[i];
  const from=left.values.map(kubelkaMunk),to=right.values.map(kubelkaMunk);
  for(let step=0;step<=200;step++){
   const fraction=step/200, concentration=left.concentration+(right.concentration-left.concentration)*fraction;
   if(!accept(concentration))continue;
   const values=step===0?left.values:step===200?right.values:from.map((value,j)=>reflectanceFromKS(value+(to[j]-value)*fraction));
   const rms=score(values);
   if(!predicted||rms<predicted.rms)predicted={concentration,values,rms,bracket:[left.concentration,right.concentration],measured:step===0||step===200};
  }
 }
 return {wavelengths,observed,predicted};
}
