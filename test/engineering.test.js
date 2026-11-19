import {test} from 'node:test';
import assert from 'node:assert/strict';
import {angular,convert,cylinder,distortion,inkArea,mounting,oee,production,reel,toothOptions,workshopInk} from '../public/engineering-model.js';
import {referenceTables} from '../public/zip-reference.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const example={th:61,pitch:3.175,around:4,label:45};
test('GAP del ejemplo, dientes enteros y reserva de material con vueltas completas',()=>{
 near(cylinder(example).gap,3.41875);
 assert.throws(()=>cylinder({...example,label:50}),/traslapan/);
 const choice=toothOptions({...example,gap:3.5});
 assert.deepEqual(choice.alternatives.map(a=>a.teeth),[61,62]);
 near(choice.alternatives[0].gap,3.41875);
 const result=production({...example,across:2,quantity:17,quantityUnit:'Etiquetas',waste:10,setup:2});
 assert.equal(result.fullTurns,3);
 near(result.metres,17/8*193.675/1000);near(result.total,3*193.675/1000*1.1+2);
});
test('distingue la cota axial de la fase y no supone una constante',()=>{
 const data={constant:28,die:17,station:8,gear:4,correction:-1,width:110,band:100};
 near(mounting(data).axial,22);
 assert.throws(()=>mounting({...data,constant:''}),/constante/);
 assert.throws(()=>mounting({...data,band:111}),/ancho/);
 near(angular({th:60,offset:-2.5}).degrees,-15);
});
test('distorsión compara espesores y las conversiones conservan el resultado interno',()=>{
 const result=distortion({diameter:80,tape:.38,plate:1.7,polyester:.15,length:200});
 near(result.factor,40.53/42.08);
 near(result.compensated,200*result.factor);
 assert.throws(()=>distortion({diameter:80,radius:25,tape:.38,plate:1.7,polyester:.15,length:200}),/corresponden/);
 near(convert({from:'pulg',to:'mm',value:1,decimals:0}).result,25.4);
 assert.throws(()=>convert({from:'kg',to:'L',value:1,decimals:2}),/densidad/);
});
test('distingue consumo por superficie total, cubierta y carga del sistema',()=>{
 const fit=inkArea({width:300,metres:100,grams:90,coverage:50});
 assert.deepEqual([fit.area,fit.covered,fit.perMaterial,fit.perCovered],[30,15,3,6]);
 const ink=workshopInk({area:1000,bcm:4,coverage:50,transfer:25,density:1,waste:10,filling:3});
 near(ink.minimum,ink.theoretical*1.1+3);
 const radius=reel({diameter:300,core:76,thickness:50,length:500});
 near(reel({diameter:radius.estimatedDiameter,core:76,thickness:50}).length,500);
 near(oee({planned:100,running:80,rate:100,total:7200,good:6840}).oee,68.4);
});
test('vincula recetas ZIP por código y sistema sin admitir sustituciones implícitas',()=>{
 const fixture={colors:'pantone,C,M,Y,K,hex_aproximado,imagen,pagina_pdf\nP1,30,0,0,0,#B3FFFF,imagenes/P1.png,1',
  bases:'codigo,nombre,sistema\nBASE,Transparente,UV\nT1,Tinta,UV',
  formulas:'pantone,sistema,componente,porcentaje_peso,fuente_pagina\nP1,UV,BASE,95,1\nP1,UV,T1,5,1'};
 const data=referenceTables(fixture);
 assert.equal(data.formulas[0].parts[1].name,'Tinta');
 assert.throws(()=>referenceTables({...fixture,formulas:fixture.formulas.replace('UV,T1','Agua,T1')}),/sin vínculo/);
 assert.throws(()=>referenceTables({...fixture,formulas:fixture.formulas.replace('UV,T1,5','UV,T1,4')}),/100 %/);
});
