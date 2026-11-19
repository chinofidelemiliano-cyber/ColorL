import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidateLots} from '../public/reuse.js';
import {differences} from '../public/instrument.js';

test('solo considera sobrantes vigentes y verificados de la misma familia y condiciones',()=>{
 const value={technology:'Base agua',family:'A',substrate:'Papel',condition:'M1',illuminant:'D50 / 2°',lab:'60, 2, 3',quantity:3,reuseStatus:'Verificado',
  reuseUntil:'2026-11-30',expiry:'2026-12-05'};
 const other=[value,{...value,family:'B'},{...value,expiry:'2026-11-01'},{...value,reuseUntil:'2026-11-01'},{...value,reuseStatus:'Pendiente'},{...value,lab:'30, 2, 3'}]
  .map((v,i)=>({id:i+1,value:v}));
 const request={...value,lab:[60,2,3],mass:2,tolerance:1};
 const hits=candidateLots(other,request,(a,b)=>differences(a,b).e[0],'2026-11-19');
 assert.deepEqual(hits.map(row=>[row.record.id,row.kilograms,row.distance]),[[1,2,0]]);
});
