import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkStates,evaluatePress,pressChecks} from '../public/press-diagnosis.js';
import {parseInstrumentCsv} from '../public/instrument-import.js';
import {corrections} from '../public/lab-model.js';
import {differences} from '../public/instrument.js';

test('las verificaciones pendientes o discrepantes bloquean la dosificación',()=>{
 const checked=Object.fromEntries(pressChecks.map(([key])=>[key,checkStates[1]]));
 assert.equal(evaluatePress({}).ready,false);
 assert.equal(evaluatePress(checked).ready,false);
 assert.equal(evaluatePress({...checked,pressEvidence:'Trabajo 123'}).ready,true);
 const blocked=evaluatePress({...checked,pressEvidence:'Trabajo 123',transferCheck:checkStates[2]});
 assert.equal(blocked.ready,false);
 assert.deepEqual(blocked.failed.map(row=>row[0]),['transferCheck']);
});

test('aprende de ajustes repetidos y descarta una dosis con un fallo verificado',()=>{
 const conditions={technology:'Base agua',substrate:'Papel',anilox:'A1',bcm:4,condition:'M1',illuminant:'D50 / 2°'};
 const inks=[{id:1,value:{technology:'Base agua'}},{id:2,value:{technology:'Base agua'}}];
 const parts=[{id:1,grams:100}], current=[50,8,0],target=[50,2,0];
 const trial=(after,verified=true)=>({value:{mode:'ajuste',verified,conditions,parts,before:current,after,additions:[{id:2,grams:1}]}});
 const evaluate=trials=>corrections(trials,inks,{target,current,conditions,parts},(a,b)=>differences(a,b).e[0]);
 const accepted=evaluate([trial([50,3,0]),trial([50,4,0]),trial([50,12,0],false)]);
 assert.equal(accepted.length,1);
 assert.equal(accepted[0].count,2);
 assert.equal(accepted[0].estimated[1],3.5);
 assert.deepEqual(evaluate([trial([50,3,0]),trial([50,12,0])]),[]);
});
test('el CSV admite formatos distintos bajo las mismas condiciones y descarta mediciones incompatibles',()=>{
 const csv='rol;formato;valores;iluminante;observador;condicion;densidad;filtro;reflectancia\npatrón;XYZ;96.422,100,82.521;D50;2;M1;0.5;A;400,20|500,30\nmuestra;CIELAB;90,2,1;D50;2;M1;0.7;A;400,21|500,31';
 const result=parseInstrumentCsv(csv);
 assert.deepEqual(result.pattern.lab,[100,0,0]);
 assert.equal(result.sample.reflectance,'400, 21\n500, 31');
 assert.throws(()=>parseInstrumentCsv(csv.replace('D50;2;M1;0.7','D65;2;M1;0.7')),/compartir/);
 assert.throws(()=>parseInstrumentCsv(csv.replace('0.7;A;','0.7;B;')),/comparable/);
});
