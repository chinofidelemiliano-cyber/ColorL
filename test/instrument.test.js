import {test} from 'node:test';
import assert from 'node:assert/strict';
import {differences,displayLab,instrumentReading,labXYZ,opticalEvidence,xyzLab} from '../public/instrument.js';
const near=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≠ ${b}`);

test('convierte XYZ con el blanco indicado y adapta sRGB D65 a D50',()=>{
 for(const key of ['D50 / 2°','D65 / 2°','D50 / 10°','D65 / 10°']){
  const lab=[52,12,-9];
  xyzLab(labXYZ(lab,key),key).forEach((value,i)=>near(value,lab[i]));
 }
 const red=instrumentReading({format:'sRGB',text:'255, 0, 0',condition:'D50 / 2°'});
 near(red.lab[0],54.291,.01);
 assert.equal(displayLab(red.lab,'D50 / 2°').hex,'#ff0000');
 assert.equal(displayLab(red.lab,'D50 / 10°'),null);
 assert.throws(()=>instrumentReading({format:'XYZ',text:'28, 18, 15',condition:'A / 2°'}),/blanco/);
});

test('CMYK requiere perfil y evidencia de la conversión aplicada',()=>{
 assert.throws(()=>instrumentReading({format:'CMYK',text:'40, 20, 0, 10',condition:'D50 / 2°'}),/ICC/);
 const converted=instrumentReading({format:'CMYK',text:'40, 20, 0, 10',condition:'D50 / 2°',profile:'Perfil verificado',iccLab:'53, 4, -8'});
 assert.deepEqual(converted.lab,[53,4,-8]);
 assert.deepEqual(converted.values,[40,20,0,10]);
 assert.equal(converted.profile,'Perfil verificado');
});

test('ΔE₀₀ coincide con referencias de Sharma y RMS exige la misma malla',()=>{
 near(differences([50,2.6772,-79.7751],[50,0,-82.7485]).e[0],2.0425,.0001);
 near(differences([50,3.1571,-77.2803],[50,0,-82.7485]).e[0],2.8615,.0001);
 const results=opticalEvidence('400, 20\n500, 30','400, 25\n500, 35','0.5','1.0');
 assert.equal(results.spectralRms,5);assert.equal(results.densityDifference,.5);
 assert.equal(opticalEvidence('400, 20\n500, 30','410, 25\n500, 35').spectralRms,null);
});
