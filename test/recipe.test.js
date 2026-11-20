import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeVariants} from '../public/lab-model.js';

test('escala a 5 kg y prioriza las proporciones medidas para el recubrimiento solicitado',()=>{
 const inks=[1,2].map(id=>({id,value:{code:String(id),technology:'UV',available:true}}));
 const conditions={technology:'UV',substrate:'BOPP',lineature:500,bcm:3,finishing:'Barniz · B1',illuminant:'D65 / 2°'};
 const entry=(id,finish,parts)=>({id,status:'Borrador',title:'P277',value:{
  processConditions:{...conditions,finishing:finish},weighedParts:parts,finalLab:[50,10,10]
 }});
 const records=[
  entry(2,'Sin recubrimiento',[{id:1,grams:200},{id:2,grams:300}]),
  entry(1,conditions.finishing,[{id:1,grams:100},{id:2,grams:400}])
 ];
 const request={code:'p277',conditions,grams:5000};
 const variants=recipeVariants(records,inks,request);
 assert.deepEqual(variants.map(v=>v.record.id),[1,2]);
 assert.deepEqual(variants[0].parts.map(p=>p.grams),[1000,4000]);
 assert.deepEqual(variants[1].changes,['Recubrimiento']);
 const legacy=recipeVariants([{id:3,title:'P277',value:{technology:'UV',components:'1: 20\n2: 80'}}],inks,request);
 assert.equal(legacy[0].changes.length,5);
 assert.deepEqual(legacy[0].parts.map(p=>p.grams),[1000,4000]);
 assert.equal(recipeVariants(records,[inks[0]],request)[0].available,false);
});
