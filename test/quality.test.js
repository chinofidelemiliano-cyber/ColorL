import {test} from 'node:test';
import assert from 'node:assert/strict';
import {individuals,pareto,readObservations} from '../public/quality-model.js';

test('calcula carta I–MR y distingue la especificación de los límites de control',()=>{
 const data=readObservations('10 11 9 100 10 11 9 10 10 10 11 9 10 11 10');
 const fit=individuals(data,{lower:9.5,upper:12,assumptions:true});
 assert.deepEqual(fit.signals,[4]);
 assert.ok(fit.rangeSignals.includes(4));
 assert.equal(fit.capability,null);
 assert.ok(fit.outside>1);
});
test('calcula capacidad solo con la evidencia mínima y diferencia límites unilaterales',()=>{
 const data=Array.from({length:30},(_,i)=>[10,10.5,11][i%3]);
 assert.equal(individuals(data,{upper:13,assumptions:false}).capability,null);
 const fit=individuals(data,{upper:13,assumptions:true});
 assert.ok(fit.capability.cpu>0);
 assert.equal(fit.capability.cpl,null);
 assert.deepEqual(Object.keys(individuals(data,{lower:8,upper:13,assumptions:true}).capability),['cp','cpk','cpu','cpl']);
});
test('acumula categorías del Pareto y rechaza frecuencias inválidas',()=>{
 const report=pareto([{category:'Espuma',count:3},{category:'espuma',count:5},{category:'Secado',count:2}]);
 assert.deepEqual(report.map(item=>[item.count,item.cumulative]),[[8,80],[2,100]]);
 assert.throws(()=>pareto([{category:'Secado',count:0}]));
});
