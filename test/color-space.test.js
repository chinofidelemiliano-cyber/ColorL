import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionSteps} from '../public/color-space.js';

test('la dirección de ajuste va de la muestra al patrón y omite ejes iguales',()=>{
 const steps=correctionSteps({dl:0,da:2,db:20},false);
 assert.deepEqual(steps,[
  'Desplaza hacia el azul (b* -20.00 respecto a la muestra).',
  'Desplaza hacia el verde (a* -2.00 respecto a la muestra).'
 ]);
 assert.match(correctionSteps({dl:0,da:2,db:20},true)[0],/cumple la tolerancia/);
 assert.match(correctionSteps({dl:-4,da:0,db:0},false)[0],/Aumenta la luminosidad/);
});
