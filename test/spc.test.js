import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gage,histogram,parseGage,parseSubgroups,scatter,spc} from '../public/spc.js';
import {riskPriority} from '../public/improvement.js';
import {courses} from '../public/course-library.js';
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} no se aproxima a ${b}`);

test('X̄–R y X̄–S usan dispersión dentro y global por separado',()=>{
 const rows=Array.from({length:30},(_,i)=>[49+i%2/10,50+i%2/10,51+i%2/10]);
 for(const type of ['X̄–R','X̄–S']){
  const result=spc(rows,type,{lower:46,upper:55,assumptions:true});
  assert.equal(result.charts.length,2);
  assert.ok(result.capability.cp>0&&result.capability.ppk>0);
 }
 assert.throws(()=>spc([[1,2,3],[1,2]],'X̄–S'),/mismo tamaño/);
});
test('P, NP, C y U usan recuento, denominador y límites apropiados',()=>{
 const p=spc(parseSubgroups('5 50\n10 100'),'P').charts[0];
 near(p.center,.1);assert.ok(p.upper[0]>p.upper[1]);
 const np=spc([[5,50],[10,50]],'NP').charts[0];near(np.center,7.5);
 assert.throws(()=>spc([[5,50],[10,100]],'NP'),/tamaños iguales/);
 const c=spc([[4],[6]],'C').charts[0];near(c.center,5);
 const u=spc([[8,2],[12,3]],'U').charts[0];near(u.center,4);
 assert.ok(u.upper[0]>u.upper[1]);
});
test('Gage cruzado valida balance y distingue componentes',()=>{
 const rows=parseGage('P1;A;10\nP1;A;12\nP1;B;11\nP1;B;13\nP2;A;20\nP2;A;22\nP2;B;21\nP2;B;23');
 const result=gage(rows);
 near(result.components.repetibilidad,2);
 near(result.components.pieza,50);
 assert.ok(result.studyPercent>0&&result.studyPercent<100);
 assert.throws(()=>gage(rows.slice(1)),/lecturas|columnas|diseño cruzado/);
});
test('histograma conserva recuentos y AMEF valida escalas',()=>{
 assert.deepEqual(histogram([0,1,2,3],2).map(bin=>bin.count),[2,2]);
 near(scatter([[1,2],[2,4],[3,6]]).r,1);
 assert.equal(scatter([[1,2],[1,4]]).r,null);
 assert.equal(riskPriority({severity:8,occurrence:4,detection:5}),160);
 assert.throws(()=>riskPriority({severity:0,occurrence:8,detection:5}));
 assert.equal(courses.length,10);
 assert.equal(courses.reduce((sum,c)=>sum+c[4].length,0),20);
});
