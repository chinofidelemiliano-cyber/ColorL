import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionSteps,workshopPlan} from '../public/color-space.js';

test('la dirección de ajuste va de la muestra al patrón y omite ejes iguales',()=>{
 const steps=correctionSteps({dl:0,da:2,db:20},false);
 assert.deepEqual(steps,[
  'Desplaza hacia el azul (b* -20.00 respecto a la muestra).',
  'Desplaza hacia el verde (a* -2.00 respecto a la muestra).'
 ]);
 assert.match(correctionSteps({dl:0,da:2,db:20},true)[0],/cumple la tolerancia/);
 assert.match(correctionSteps({dl:-4,da:0,db:0},false)[0],/Aumenta la luminosidad/);
});

test('la guía propone concentrar para la muestra clara y baja en croma, y ensaya rojo cálido',()=>{
 const [light,hue]=workshopPlan({dl:29,da:-11,db:-2,dc:-8.34},false);
 assert.match(light.action,/más concentrada/);
 assert.match(hue.action,/rojo cálido/);
 assert.match(workshopPlan({dl:-4,da:0,db:0,dc:1},false)[0].action,/base transparente/);
 assert.deepEqual(workshopPlan({dl:1,da:1,db:1,dc:1},true),[]);
});
