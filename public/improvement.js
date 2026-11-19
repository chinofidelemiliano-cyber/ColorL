export const methods={
 '5 porqués':[
  ['why1','¿Por qué ocurrió?'],['why2','¿Por qué ocurrió esa condición?'],['why3','¿Qué permitió la desviación?'],['why4','¿Qué control faltó?'],['why5','¿Qué causa se puede comprobar?']],
 Ishikawa:[['method','Método'],['machine','Máquina'],['material','Material'],['people','Personas'],['measurement','Medición'],['environment','Medio ambiente']],
 '8D':[['d1','D1 · Equipo'],['d2','D2 · Descripción cuantificada'],['d3','D3 · Contención'],['d4','D4 · Causa raíz y escape'],['d5','D5 · Elegir corrección'],['d6','D6 · Aplicar y validar'],['d7','D7 · Evitar recurrencia'],['d8','D8 · Cierre y lecciones']],
 PHVA:[['plan','Planear · Objetivo e hipótesis'],['do','Hacer · Prueba controlada'],['check','Verificar · Comparación'],['act','Actuar · Ajuste y estandarización']],
 DMAIC:[['define','Definir · Alcance'],['measure','Medir · Línea base'],['analyze','Analizar · Prueba causal'],['improve','Mejorar · Ensayo'],['control','Controlar · Plan y métrica']],
 AMEF:[['failure','Modo de falla'],['effect','Efecto'],['cause','Causa y controles actuales'],['severity','Severidad (1–10)','number'],['occurrence','Ocurrencia (1–10)','number'],['detection','Dificultad de detección (1–10)','number']]
};
export const examples={
 '5 porqués':'Sigue una cadena sobre un defecto concreto, por ejemplo espuma durante la recirculación. Verifica cada relación con hechos.',
 Ishikawa:'Para rayas en impresión, registra hipótesis por las seis M. Por ejemplo anilox dañado, método de limpieza, partículas y posición del defecto.',
 '8D':'Para una reclamación por desregistro, cuantifica el defecto, protege el lote, valida causa y escape y actualiza los controles.',
 PHVA:'Para reducir desperdicio de arranque, fija un objetivo, cambia una variable en una prueba y compara el mismo tipo de trabajo.',
 DMAIC:'Para variación de ΔE durante la tirada, mide línea base, verifica causas y define límites y responsables para el control sostenido.',
 AMEF:'Para curado deficiente, identifica el efecto sobre adhesión, revisa los controles de dosis y justifica las tres escalas con tu equipo.'
};
export function riskPriority(scores){
 const values=['severity','occurrence','detection'].map(key=>Number(scores[key]));
 if(values.some(value=>!Number.isSafeInteger(value)||value<1||value>10))throw new Error('En AMEF registra severidad, ocurrencia y detección como enteros de 1 a 10.');
 return values.reduce((product,value)=>product*value,1);
}
