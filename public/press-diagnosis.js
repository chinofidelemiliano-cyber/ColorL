export const pressChecks=[
 ['repeatability','Repetibilidad del instrumento','Repite las lecturas en una zona homogénea con respaldo, geometría e iluminante controlados.'],
 ['transferCheck','Anilox, placa y transferencia','Comprueba limpieza, BCM real, montaje y presión según la ficha de trabajo. Compara una banda de prueba con la condición validada.'],
 ['substrateCheck','Sustrato y acabado','Confirma lote, tratamiento, fondo, blanco de respaldo, barniz y laminado frente al patrón aprobado.'],
 ['inkCheck','Estado de la tinta y secado / curado','Contrasta viscosidad, temperatura y pH si aplica. Revisa si el secado o el curado reproduce la condición aprobada.']
];
export const checkStates=['Pendiente','Coincide con referencia','Diferencia detectada'];
const procedures={
 'Baja intensidad o cromaticidad':[
  'Un film más delgado, menor transferencia o pérdida de fuerza tintórea pueden reducir la intensidad.',
  'Compara densidad y CIELAB sobre el mismo fondo. Inspecciona el anilox y compara el BCM real con el ensayo aprobado.',
  'Estabiliza la transferencia y prueba una muestra de la mezcla original. Guarda las lecturas antes de considerar un ajuste de formulación.',
  'Aumentar pigmento para compensar una transferencia deficiente puede producir sobreintensidad cuando se recupere el aporte.'],
 'Cambio de tonalidad durante la tirada':[
  'La evaporación, el calentamiento y la variación de película pueden cambiar la apariencia durante el trabajo.',
  'Recoge muestras cronológicas. Relaciona color, temperatura, viscosidad, velocidad y reposición con lo observado al inicio.',
  'Recupera la condición de trabajo documentada y vuelve a muestrear con la misma frecuencia.',
  'Cambiar la receta mientras fluctúa el proceso puede ocultar la causa y aumentar el desperdicio.'],
 'Viscosidad o pH fuera de rango':[
  'Temperatura, evaporación o cambios de composición pueden desplazar la reología. En tintas base agua el pH también puede alterar la estabilidad.',
  'Usa el método y temperatura especificados por el fabricante. Mide pH con instrumento calibrado cuando la tecnología lo requiera.',
  'Aísla una muestra y contrasta con la ficha antes de intervenir. Usa el diagnóstico fisicoquímico para buscar un producto con aplicación y dosis documentadas.',
  'Diluir o ajustar el pH sin comprobar la ficha puede desestabilizar la tinta y alterar su adherencia.'],
 'Mala transferencia o anilox':[
  'El volumen útil puede disminuir por obstrucción o desgaste. El BCM nominal no describe por sí solo el aporte.',
  'Compara BCM real, inspección de celdas y densidad de una muestra. Verifica montaje y condición de placa.',
  'Sigue el procedimiento autorizado de inspección o limpieza y repite la muestra con el aporte medido.',
  'Aumentar presión o aporte sin diagnosticar puede ampliar puntos y cambiar el registro.'],
 'Espuma':[
  'El aire puede entrar por la recirculación o por agitación. La espuma también puede indicar un cambio de formulación o contaminación.',
  'Observa dónde aparece la espuma y contrasta recirculación, nivel y una muestra aislada del lote.',
  'Corrige la causa mecánica según el procedimiento aprobado. Si persiste, consulta el método y el intervalo de la ficha para un antiespumante compatible.',
  'El exceso de antiespumante puede afectar humectación y adherencia.'],
 'Baja opacidad':[
  'La película, el fondo y la formulación pueden cambiar el poder cubriente aparente.',
  'Mide sobre respaldos blanco y negro comparables y verifica la secuencia de blanco, color y acabado.',
  'Prueba primero la condición documentada de aporte y respaldo y registra el contraste.',
  'Aumentar la carga sin comprobar curado o secado puede empeorar el repinte.'],
 'Adherencia deficiente':[
  'El tratamiento, la contaminación o el secado y curado pueden afectar la unión al sustrato.',
  'Verifica lote, cara del material y tratamiento. Aplica la prueba de adherencia indicada para ese sustrato y acabado.',
  'Separa una muestra y prueba el sistema autorizado con un solo cambio. Consulta las fichas de tinta y sustrato.',
  'Cambiar resina o añadir promotor sin compatibilidad puede mover el color o comprometer requisitos del producto.'],
 'Secado prematuro o repinte':[
  'La velocidad, circulación de aire, temperatura y espesor de película pueden dejar tinta seca en zonas de transferencia o insuficientemente seca al contacto.',
  'Identifica dónde aparece primero el defecto y compara velocidad, secado, BCM real y estado de tinta con el trabajo aprobado.',
  'Verifica secado o transferencia en una corrida controlada con parámetros autorizados.',
  'Un cambio de secado puede resolver un extremo y agravar el otro. No ajustes química antes de localizar el punto del defecto.'],
 'Curado UV insuficiente':[
  'La película, longitud de onda, dosis, irradiancia y velocidad pueden alterar el curado.',
  'Comprueba la dosis e irradiancia con radiometría compatible y aplica las pruebas que indica la ficha del sistema UV.',
  'Aísla la producción afectada y deriva los ajustes de equipos UV al personal autorizado según el procedimiento.',
  'Una impresión seca al tacto no garantiza curado. Aumentar la potencia sin evaluar el sistema puede calentar o deformar el material.'],
 'Metamerismo':[
  'Dos curvas espectrales diferentes pueden coincidir visualmente bajo una luz y separarse bajo otra.',
  'Verifica el mismo respaldo y condición M. Compara las curvas y haz evaluaciones bajo más de un iluminante controlado.',
  'Registra la iluminación de uso y busca una fórmula medida que cumpla las condiciones relevantes.',
  'Ajustar un solo ΔE sin comprobar el segundo iluminante puede empeorar la coincidencia en servicio.'],
 'Contaminación':[
  'Residuos, mezcla de lotes o contacto con otro sistema pueden alterar tono, viscosidad y estabilidad.',
  'Separa una muestra y compárala con material limpio del lote. Revisa historial de limpieza y trazabilidad de los envases.',
  'Aísla el lote y sigue el procedimiento de calidad. Solo vuelve a usar material con aptitud confirmada.',
  'Diluir un contaminante puede ocultar un defecto inicial sin resolver su incompatibilidad.']
};
export const defectNames=Object.keys(procedures);
export function diagnosis(name){
 return Object.hasOwn(procedures,name)?procedures[name]:null;
}
export function evaluatePress(input){
 const checks=Object.fromEntries(pressChecks.map(([key])=>[key,checkStates.includes(input[key])?input[key]:checkStates[0]]));
 const failed=pressChecks.filter(([key])=>checks[key]===checkStates[2]);
 const missing=pressChecks.filter(([key])=>checks[key]===checkStates[0]);
 const evidence=String(input.pressEvidence??'').trim();
 return {ready:!failed.length&&!missing.length&&Boolean(evidence),checks,failed,missing,evidence};
}
