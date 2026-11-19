import {estimateInk} from './print-calculations.js';
const error=message=>{throw new Error(message);};
function numeric(data,key,label,{min=0,max=1e12,integer=false,optional=false}={}){
 const raw=data[key];
 if(String(raw??'').trim()===''){if(optional)return null;error('Falta '+label+'.');}
 const value=Number(raw);
 if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))error('Verifica '+label+' y sus unidades.');
 return value;
}
const positive=(d,k,label)=>numeric(d,k,label,{min:1e-9});
const count=(d,k,label)=>numeric(d,k,label,{min:1,max:1e8,integer:true});
const percent=(d,k,label)=>numeric(d,k,label,{min:0,max:100});
export function cylinder(data){
 const th=count(data,'th','el número de dientes'),pitch=positive(data,'pitch','el paso'),around=count(data,'around','las cavidades al desarrollo'),label=positive(data,'label','la longitud de etiqueta');
 const development=th*pitch,gap=development/around-label;
 if(gap< -1e-8)error('Las etiquetas se traslapan en este desarrollo. Revisa el cilindro y las cavidades.');
 return {th,pitch,around,label,development,gap:Math.max(0,gap)};
}
export function toothOptions(data){
 const label=positive(data,'label','la longitud de etiqueta'),gap=numeric(data,'gap','el GAP'),around=count(data,'around','las cavidades'),pitch=positive(data,'pitch','el paso');
 const th=(label+gap)*around/pitch, low=Math.floor(th+1e-10),high=Math.ceil(th-1e-10);
 const alternatives=[...new Set([low,high])].filter(n=>n>0).map(teeth=>({teeth,gap:teeth*pitch/around-label,development:teeth*pitch}));
 return {th,pitch,alternatives};
}
export function production(data){
 const geometry=cylinder(data),across=count(data,'across','las cavidades al eje'),quantity=count(data,'quantity','la cantidad');
 const labels=quantity*(data.quantityUnit==='Millares'?1000:1), labelsPerTurn=geometry.around*across, exactTurns=labels/labelsPerTurn, fullTurns=Math.ceil(exactTurns);
 const metres=exactTurns*geometry.development/1000,fullMetres=fullTurns*geometry.development/1000;
 const waste=fullMetres*percent(data,'waste','el desperdicio')/100,setup=numeric(data,'setup','la preparación');
 const speed=numeric(data,'speed','la velocidad',{min:1e-9,optional:true});
 const expectedGap=numeric(data,'gap','el GAP de referencia',{optional:true});
 return {...geometry,labels,labelsPerTurn,exactTurns,fullTurns,metres,fullMetres,waste,setup,total:fullMetres+waste+setup,workMinutes:speed===null?null:(fullMetres+waste+setup)/speed,
  perMinute:speed===null?null:speed*1000*labelsPerTurn/geometry.development,
  thousandPerHour:speed===null?null:.06*speed*1000*labelsPerTurn/geometry.development,gapDifference:expectedGap===null?null:geometry.gap-expectedGap};
}
export function distortion(data){
 const diameter=numeric(data,'diameter','el diámetro',{min:1e-9,optional:true}),givenRadius=numeric(data,'radius','el radio',{min:1e-9,optional:true});
 if(diameter===null&&givenRadius===null)error('Ingresa el diámetro medido o el radio.');
 if(diameter!==null&&givenRadius!==null&&Math.abs(diameter/2-givenRadius)>.001)error('El diámetro y el radio no corresponden entre sí.');
 const radius=givenRadius??diameter/2, tape=numeric(data,'tape','el Sticky Back'),plate=positive(data,'plate','el espesor de placa'),polyester=numeric(data,'polyester','el poliéster');
 if(polyester>plate)error('El poliéster forma parte del espesor total de la placa.');
 const length=positive(data,'length','la longitud del diseño'),factor=(radius+tape+polyester)/(radius+tape+plate);
 const required=numeric(data,'required','el desarrollo requerido',{min:1e-9,optional:true});
 return {radius,factor,scale:factor*100,reduction:(1-factor)*100,compensated:length*factor,fromRequired:required===null?null:length*factor-required};
}
const units={
 mm:['length',1],cm:['length',10],m:['length',1000],pulg:['length',25.4],mil:['length',.0254],'µm':['length',.001],
 g:['mass',1],kg:['mass',1000],L:['volume',1],mL:['volume',.001],BCM:['volume-area',.001/.0254**2],'cm³/m²':['volume-area',1],
 'm/min':['speed',1],'ft/min':['speed',.3048]
};
export const unitNames=Object.keys(units);
export function convert(data){
 const source=Object.hasOwn(units,data.from)?units[data.from]:null,target=Object.hasOwn(units,data.to)?units[data.to]:null;
 if(!source||!target||source[0]!==target[0])error('Las unidades deben medir la misma magnitud. Para convertir masa y volumen se requiere densidad, en una operación aparte.');
 const value=numeric(data,'value','el valor',{min:-1e12}),decimals=numeric(data,'decimals','los decimales',{min:0,max:12,integer:true});
 const result=value*source[1]/target[1];
 return {result,shown:result.toFixed(decimals),to:data.to};
}
export function inkArea(data){
 const width=positive(data,'width','el ancho efectivo'),metres=positive(data,'metres','los metros impresos'),grams=numeric(data,'grams','los gramos');
 const fraction=percent(data,'coverage','la cobertura')/100,area=width/1000*metres,covered=area*fraction;
 if(covered===0&&grams>0)error('Un consumo positivo requiere una cobertura mayor que cero.');
 const labelWidth=numeric(data,'labelWidth','el ancho de etiqueta',{min:1e-9,optional:true}),labelLength=numeric(data,'labelLength','el largo de etiqueta',{min:1e-9,optional:true}),labels=numeric(data,'labels','las etiquetas',{min:1,max:1e8,integer:true,optional:true});
 if([labelWidth,labelLength,labels].some(v=>v!==null)&&[labelWidth,labelLength,labels].some(v=>v===null))error('Para calcular aprovechamiento ingresa las dos dimensiones y la cantidad de etiquetas.');
 const labelsArea=labels===null?null:labels*labelWidth*labelLength/1e6;
 if(labelsArea!==null&&labelsArea>area+1e-8)error('El área de etiquetas supera el área de banda indicada.');
 return {area,covered,linear:grams/metres,perMaterial:grams/area,perCovered:covered?grams/covered:null,
  labelsArea,remaining:labelsArea===null?null:Math.max(0,area-labelsArea),utilization:labelsArea===null?null:100*labelsArea/area};
}
export function reel(data){
 const diameter=positive(data,'diameter','el diámetro exterior'),core=positive(data,'core','el diámetro del núcleo'),thickness=positive(data,'thickness','el calibre');
 if(diameter<=core)error('El diámetro exterior debe superar al núcleo.');
 const length=Math.PI*(diameter**2-core**2)/(4*thickness);
 // µm a mm y mm a metros cancelan los dos factores de mil.
 const desired=numeric(data,'length','la longitud objetivo',{optional:true});
 return {length,estimatedDiameter:desired===null?null:Math.sqrt(core**2+4*thickness*desired/Math.PI)};
}
export function mounting(data){
 const baseline=numeric(data,'constant','la constante documentada',{min:-1000,max:1000}),die=numeric(data,'die','la referencia del suaje'),station=numeric(data,'station','la referencia de estación'),gear=numeric(data,'gear','la distancia del engrane');
 const correction=numeric(data,'correction','la compensación axial',{min:-1000,max:1000}),width=positive(data,'width','el ancho útil');
 const axial=baseline-(die-station)+gear+correction;
 if(axial<0||axial>width)error('La cota axial queda fuera del ancho útil documentado.');
 const band=positive(data,'band','el ancho de banda');
 if(band>width)error('El ancho de banda supera el ancho útil de los componentes seleccionados.');
 const design=numeric(data,'design','la posición lateral del diseño',{optional:true});
 if(design!==null&&design>width)error('La posición lateral del diseño supera el ancho útil.');
 return {axial,width,band,design};
}
export function angular(data){
 const teeth=count(data,'th','los dientes'),offset=numeric(data,'offset','el desfase en dientes',{min:-teeth,max:teeth});
 return {offset,degrees:offset*360/teeth};
}
export function oee(data){
 const planned=positive(data,'planned','el tiempo planificado'),running=numeric(data,'running','el tiempo operativo'),rate=positive(data,'rate','la velocidad ideal');
 const total=numeric(data,'total','la producción total',{min:0,max:1e8,integer:true}),good=numeric(data,'good','las piezas buenas',{min:0,max:1e8,integer:true});
 if(running>planned||good>total||(running===0&&total>0)||total>rate*running+1e-9)error('Revisa tiempos, producción y velocidad ideal. Los cocientes no pueden superar 100 %.');
 const availability=running/planned, performance=running?total/(running*rate):0,quality=total?good/total:0;
 return {availability:100*availability,performance:100*performance,quality:100*quality,oee:100*availability*performance*quality};
}

export function workshopInk(data){
 const area=positive(data,'area','el área'),bcm=positive(data,'bcm','el BCM real'),coverage=percent(data,'coverage','la cobertura');
 const transfer=percent(data,'transfer','la transferencia'),density=positive(data,'density','la densidad'),waste=percent(data,'waste','el desperdicio');
 const filling=numeric(data,'filling','la carga inicial'), actual=numeric(data,'actual','el consumo real',{optional:true});
 const fit=estimateInk({area,bcm,coverage,transfer,density,unitCost:null,labels:null});
 const wasteKg=fit.kilograms*waste/100;
 return {theoretical:fit.kilograms,actual,wasteKg,filling,minimum:fit.kilograms+wasteKg+filling};
}
