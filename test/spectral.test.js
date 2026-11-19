import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kubelkaMunk,parseCalibration,reflectanceFromKS,spectralFit} from '../public/spectral-model.js';
import {nearestStandards,parseStandardsCsv,sameMeasurement} from '../public/color-standards.js';

const grid=[390,430,470,510,550,590,630,670,710];
const source=['nm, 0, 10',...grid.map((nm,i)=>[nm,90-i,45-i].join(', '))].join('\n');

test('convierte reflectancia y K/S sin desbordar las condiciones válidas',()=>{
 for(const r of [0.01,20,55,100])assert.ok(Math.abs(reflectanceFromKS(kubelkaMunk(r))-r)<1e-9);
 assert.throws(()=>kubelkaMunk(0));
 assert.throws(()=>parseCalibration(source.replace('nm, 0, 10','nm, 10, 10')));
});

test('ajusta una interpolación entre medidas y filtra proporciones inviables',()=>{
 const series=parseCalibration(source);
 const target=grid.map((nm,i)=>[nm,reflectanceFromKS((kubelkaMunk(90-i)+kubelkaMunk(45-i))/2)]);
 const {observed,predicted}=spectralFit(series,target);
 assert.equal(predicted.concentration,5);
 assert.ok(predicted.rms<1e-9);
 assert.equal(predicted.measured,false);
 assert.ok(observed.rms>0);
 assert.deepEqual(predicted.bracket,[0,10]);
 assert.equal(spectralFit(series,target,c=>c<=2).predicted.concentration,2);
 assert.throws(()=>spectralFit(series,target.slice(1)),/malla/);
});

test('importa estándares con metadatos y restringe ΔE a mediciones compatibles',()=>{
 const header='Nombre;Código;Colección;Iluminante;Observador;Condición;L*;a*;b*;Cliente;Tolerancia';
 const rows=[header,'A;A1;Propia;D50;2;M1;50;3;1;Taller;1.5','B;B1;Propia;D65;2;M1;50;3;1;Taller;1.5'].join('\n');
 const parsed=parseStandardsCsv(rows);
 assert.equal(parsed[0].value.observer,'2°');
 assert.equal(parsed[0].value.tolerance,1.5);
 assert.equal(sameMeasurement(parsed[0].value,parsed[1].value),false);
 const hits=nearestStandards(parsed,{lab:[50,3,1],illuminant:'D50',observer:'2°',condition:'M1',customer:'taller'},()=>0);
 assert.deepEqual(hits.map(hit=>hit.record.title),['A']);
 assert.throws(()=>parseStandardsCsv(rows+'\nA;A1;Propia;D50;2;M1;50;3;1;Taller;1.5'),/ya aparece/);
 assert.throws(()=>parseStandardsCsv(header+'\nA;A1;Propia;D50;2;M1;;3;1;Taller;1.5'),/Completa L/);
});
