import {parseLab,readLab,spectrum} from './lab-model.js';

const whites={
 'D50 / 2°':[96.422,100,82.521],'D65 / 2°':[95.047,100,108.883],
 'D50 / 10°':[96.720,100,81.427],'D65 / 10°':[94.811,100,107.304]
};
const adaptTo50=[[1.0478112,.0228866,-.0501270],[.0295424,.9904844,-.0170491],[-.0092345,.0150436,.7521316]];
const adaptTo65=[[.9555766,-.0230393,.0631636],[-.0282895,1.0099416,.0210077],[.0122982,-.0204830,1.3299098]];
const matrix=(rows,v)=>rows.map(row=>row.reduce((sum,c,i)=>sum+c*v[i],0));
const srgbToXYZ=[[.4124564,.3575761,.1804375],[.2126729,.7151522,.0721750],[.0193339,.1191920,.9503041]];
const xyzToRGB=[[3.2404542,-1.5371385,-.4985314],[-.9692660,1.8760108,.0415560],[.0556434,-.2040259,1.0572252]];
const eps=216/24389, kappa=24389/27;
const numberList=(text,length)=>{
 const pieces=String(text??'').trim().split(/[;,\s]+/);
 if(pieces.length!==length||pieces.some(part=>part===''||!Number.isFinite(Number(part))))throw new Error('Ingresa '+length+' valores numéricos con decimales mediante punto.');
 return pieces.map(Number);
};
const whiteOf=condition=>whites[String(condition).trim().toUpperCase()];
export function xyzLab(xyz, condition){
 const white=whiteOf(condition);
 if(!white)throw new Error('La conversión XYZ requiere un blanco de referencia D50 o D65, de 2° o 10°.');
 const [x,y,z]=xyz.map((v,i)=>{
  const t=v/white[i];
  return t>eps?Math.cbrt(t):(kappa*t+16)/116;
 });
 return [116*y-16,500*(x-y),200*(y-z)];
}
export function labXYZ([l,a,b],condition){
 const white=whiteOf(condition);
 if(!white)return null;
 const y=(l+16)/116;
 return [y+a/500,y,y-b/200].map((value,i)=>white[i]*(value**3>eps?value**3:(116*value-16)/kappa));
}
export function displayLab(lab,condition){
 const key=String(condition).trim().toUpperCase();
 if(!['D50 / 2°','D65 / 2°'].includes(key))return null;
 let xyz=labXYZ(lab,key);
 if(key.startsWith('D50'))xyz=matrix(adaptTo65,xyz);
 const rgb=matrix(xyzToRGB,xyz.map(v=>v/100));
 const clipped=rgb.some(v=>v<-.00001||v>1.00001);
 const bytes=rgb.map(v=>Math.min(255,Math.max(0,Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055)))));
 return {hex:'#'+bytes.map(v=>v.toString(16).padStart(2,'0')).join(''),clipped};
}
export function instrumentReading({format,text,profile,iccLab,condition}){
 let values, lab;
 if(format==='CIELAB'){values=parseLab(text);lab=values;}
 else if(format==='CIELCh'){values=numberList(text,3);lab=readLab(text,format);}
 else if(format==='XYZ'){
  values=numberList(text,3);
  if(values.some(value=>value<0||value>200))throw new Error('Ingresa XYZ relativos, con Y del blanco igual a 100.');
  lab=xyzLab(values,condition);
 }else if(format==='sRGB'){
  values=numberList(text,3);
  if(values.some(value=>value<0||value>255))throw new Error('Los canales sRGB deben estar entre 0 y 255.');
  const key=String(condition).trim().toUpperCase();
  if(!['D50 / 2°','D65 / 2°'].includes(key))throw new Error('sRGB solo se convierte a CIELAB con observador de 2° y blanco D50 o D65.');
  const linear=values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  let xyz=matrix(srgbToXYZ,linear).map(v=>v*100);
  if(key.startsWith('D50'))xyz=matrix(adaptTo50,xyz);
  lab=xyzLab(xyz,key);
 }else if(format==='CMYK'){
  values=numberList(text,4);
  if(values.some(value=>value<0||value>100))throw new Error('Los canales CMYK deben estar entre 0 y 100 %.');
  if(!String(profile||'').trim()||!String(iccLab||'').trim())throw new Error('Para comparar CMYK indica el perfil ICC y el CIELAB que produjo tu conversión. KCYM 4C conserva ambos.');
  lab=parseLab(iccLab);
 }else throw new Error('Formato de medición desconocido.');
 if(lab.some(v=>!Number.isFinite(v))||lab[0]<-.0001||lab[0]>100.0001||lab.slice(1).some(v=>Math.abs(v)>200))
  throw new Error('La lectura convertida queda fuera del rango CIELAB admitido. Verifica el blanco y las unidades.');
 return {format,values,lab:[Math.min(100,Math.max(0,lab[0])),...lab.slice(1)],...(format==='CMYK'?{profile:profile.trim()}:{}),xyz:labXYZ(lab,condition)};
}
export function opticalEvidence(patternText,sampleText,patternDensity,sampleDensity){
 const pattern=spectrum(patternText),sample=spectrum(sampleText);
 const optical=value=>{
  if(String(value??'').trim()==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>10)throw new Error('Registra densidades ópticas de 0 a 10 en la misma condición.');
  return n;
 };
 const pd=optical(patternDensity),sd=optical(sampleDensity);
 const common=pattern.length>=2&&pattern.length===sample.length&&pattern.every(([nm],i)=>nm===sample[i][0]);
 return {pattern,sample,patternDensity:pd,sampleDensity:sd,densityDifference:pd==null||sd==null?null:sd-pd,
  spectralRms:common?Math.sqrt(pattern.reduce((sum,p,i)=>sum+(p[1]-sample[i][1])**2,0)/pattern.length):null};
}

const hue=(a,b)=>(Math.atan2(b,a)*180/Math.PI+360)%360;
const cos=d=>Math.cos(d*Math.PI/180), sin=d=>Math.sin(d*Math.PI/180);
export function differences(p,m) {
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
