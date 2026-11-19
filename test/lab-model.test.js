import test from 'node:test';
import assert from 'node:assert/strict';
import {corrections, diagnostic, formulations, mixture, readLab, spectrum} from '../public/lab-model.js';
import {organize, parseSeparated} from '../public/catalog-import.js';

const conditions={technology:'Base agua',substrate:'PE tratado',anilox:'A1',bcm:4,condition:'M1',illuminant:'D50 / 2°'};
const inks=[
 {id:1,value:{code:'Base',technology:'Base agua'}},
 {id:2,value:{code:'Pigmento',technology:'Base agua'}},
 {id:3,value:{code:'Sin stock',technology:'Base agua',available:false}}
];
const parts=[{id:1,grams:90},{id:2,grams:10}];
const delta=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('escala una mezcla medida y excluye ensayos incompatibles, pendientes o sin insumos',()=>{
 const verified={verified:true,mode:'mezcla',after:[50,0,0],conditions,parts};
 const rows=[verified,{...verified,verified:false},{...verified,conditions:{...conditions,bcm:4.2}},{...verified,parts:[...parts,{id:3,grams:10}]}].map(value=>({value}));
 const [result,...excluded]=formulations(rows,inks,{target:[50,0,0],conditions,batch:250},delta);
 assert.deepEqual(excluded,[]);
 assert.equal(result.delta,0);
 assert.deepEqual(result.parts,[{id:1,grams:225,percent:90},{id:2,grams:25,percent:10}]);
 const repeated=formulations([{value:verified},{value:{...verified,after:[51,0,0]}}],inks,{target:[50,0,0],conditions,batch:250},delta);
 assert.deepEqual([repeated.length,repeated[0].count,repeated[0].best,repeated[0].delta],[1,2,0,1]);
 const limited=inks.map(ink=>ink.id===1?{...ink,value:{...ink.value,stockGrams:200}}:ink);
 assert.deepEqual(formulations(rows,limited,{target:[50,0,0],conditions,batch:250},delta),[]);
});

test('corrección conserva proporciones de adición y entrega una reformulación de igual masa',()=>{
 const adjustment={verified:true,mode:'ajuste',conditions,parts,before:[50,4,0],after:[50,0,0],additions:[{id:1,grams:2}]};
 const wrong={...adjustment,parts:[{id:1,grams:70},{id:2,grams:30}]};
 const [result,...excluded]=corrections([{value:adjustment},{value:wrong}],inks,{target:[50,0,0],current:[50,4,0],conditions,parts:parts.map(p=>({...p,grams:p.grams*3}))},delta);
 assert.deepEqual(excluded,[]);
 assert.deepEqual(result.add,[{id:1,grams:6}]);
 assert.equal(result.score,0);
 assert.ok(Math.abs(result.reduced.reduce((sum,p)=>sum+p.grams,0)-300)<1e-9);
 assert.ok(result.reduced[1].difference<0);
});

test('limita las dosis al rango documentado para tecnología, familia, sustrato y ajuste',()=>{
 const input={application:'pH',technology:'Base agua',family:'A',substrate:'PE',direction:'Subir',batch:500};
 const value={...input,manufacturerVerified:true,compatibility:'A, B',substrates:'PE',diagnosisDirection:'Subir',doseMin:'0.5',doseMax:'1',procedure:'Prueba',risks:'Ficha',reference:'Rev. 2'};
 const [result,...excluded]=diagnostic([{value},{value:{...value,doseMin:''}},{value:{...value,substrates:'PET'}},{value:{...value,manufacturerVerified:false}}],input);
 assert.deepEqual(excluded,[]);
 assert.deepEqual([result.minGrams,result.maxGrams],[2.5,5]);
});

test('interpreta CIELCh, revisa curvas y extrae catálogos con comillas y separadores',()=>{
 assert.deepEqual(readLab('50, 10, 0','CIELCh'),[50,10,0]);
 assert.throws(()=>spectrum('400, 10\n400, 90'));
 assert.deepEqual(spectrum('500, 10\n400, 90'),[[400,90],[500,10]]);
 assert.throws(()=>mixture('Base: 10\nBase: 5',inks));
 const rows=parseSeparated('Código;Nombre;Tecnología\nK1;"Rojo; vivo";Base agua\n');
 assert.deepEqual(organize([rows])[0],{code:'K1',name:'Rojo; vivo',technology:'Base agua',color:'',colorName:''});
});
