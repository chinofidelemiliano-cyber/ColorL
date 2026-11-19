import {courses} from './course-library.js';

const references=[
 ['ISO 12647-6','Control del proceso flexográfico','Identifica el proceso y la condición aplicable antes de fijar objetivos o tolerancias en la orden de trabajo.','https://www.iso.org/search.html?q=ISO%2012647-6'],
 ['ISO 13655','Medición espectral y colorimétrica','Documenta instrumento, condición de medición, geometría y respaldo. M0, M1, M2 y M3 describen condiciones del instrumento, distintas del iluminante y del observador usados para calcular CIELAB.','https://www.iso.org/search.html?q=ISO%2013655'],
 ['ISO 3664','Observación del color','Verifica requisitos de la cabina, iluminación y evaluación visual según el uso aplicable.','https://www.iso.org/search.html?q=ISO%203664'],
 ['ISO/CIE 11664','Colorimetría','Localiza la parte que corresponda al observador, iluminante, espacio o cálculo empleado.','https://www.iso.org/search.html?q=ISO%20CIE%2011664'],
 ['ISO 17972','Intercambio CxF','Conserva el archivo de intercambio y confirma la parte aplicable a la comunicación del dato de color.','https://www.iso.org/search.html?q=ISO%2017972'],
 ['ISO 9001','Gestión de calidad','Usa la referencia para controlar evidencias, responsabilidades, cambios y verificación.','https://www.iso.org/search.html?q=ISO%209001'],
 ['ISO 2859-1','Muestreo por atributos','Confirma el plan y su aplicación al lote con calidad y el texto autorizado. No deduzcas un plan de una carta de control.','https://www.iso.org/search.html?q=ISO%202859-1'],
 ['FIRST – FTA','Guía flexográfica','Contrasta las prácticas de preprensa, puesta a punto, caracterización y producción con la edición aplicable.','https://www.flexography.org/first/']
];
export function createAcademy({state,esc,heading,btn,api,refresh,toast}){
 const completed=()=>new Set(state.records.filter(r=>r.kind==='academia'&&r.status==='Completada').map(r=>r.value.moduleKey).filter(Boolean));
 function view(){
  const done=completed(),total=courses.reduce((sum,course)=>sum+course[4].length,0);
  return heading('Academia de flexografía','Estudia cada tema, resuelve una práctica y evalúate cuando quieras.')+
   '<section class="panel academy-progress"><strong id="academy-progress">'+done.size+' de '+total+' módulos finalizados</strong><progress max="'+total+'" value="'+done.size+'"></progress></section>'+
   courses.map(([id,title,level,description,modules,[question,answers]])=>'<details class="panel lesson"><summary>'+esc(title)+' · '+esc(level)+'</summary><p>'+esc(description)+'</p>'+
    modules.map(([name,theory,flow,example,exercise,answer,tool],index)=>{
     const key=id+'-'+index;
     return '<article class="academy-module"><h3>'+esc(name)+'</h3><p>'+esc(theory)+'</p><div class="academy-flow" aria-label="Diagrama">'+
      flow.split(' → ').map(block=>'<span>'+esc(block)+'</span>').join('')+'</div><h4>Ejemplo aplicado</h4><p>'+esc(example)+'</p><h4>Práctica</h4><p>'+esc(exercise)+'</p>'+
      '<details><summary>Ver resolución comentada</summary><p>'+esc(answer)+'</p></details><div class="form-actions">'+
      (tool?btn('Abrir herramienta','data-view="'+esc(tool)+'"','calc'):'')+btn(done.has(key)?'Módulo completado':'Marcar módulo completado','data-course-module="'+key+'"'+(done.has(key)?' disabled':''),'check')+'</div></article>';
    }).join('')+'<details class="academy-quiz"><summary>Cuestionario opcional</summary><form data-course-quiz="'+id+'"><p>'+esc(question)+'</p>'+
    [...answers].sort().map(answer=>'<label class="order-choice"><input required type="radio" name="answer" value="'+esc(answer)+'"> '+esc(answer)+'</label>').join('')+
    '<div class="form-actions"><button class="secondary">Comprobar respuesta</button></div><p class="notice" role="status"></p></form></details></details>').join('')+
   '<details class="panel lesson"><summary>Normas y referencias oficiales</summary><p>Consulta la edición vigente y su alcance en el catálogo del organismo. Esta guía explica la aplicación general y no incluye tolerancias ni reproduce el texto normativo.</p>'+
   references.map(([title,scope,action,url])=>'<article class="academy-module"><h3>'+esc(title)+'</h3><p>'+esc(scope)+'. '+esc(action)+'</p><a class="text-button" href="'+url+'" target="_blank" rel="noopener noreferrer">Consultar fuente oficial</a></article>').join('')+'</details>'+
   '<section class="panel"><h2>Círculo cromático</h2><div class="form-actions"><div aria-hidden="true" style="width:100px;height:100px;flex:none;border-radius:50%;background:conic-gradient(red,#ff0,#0f0,#0ff,#00f,#f0f,red)"></div><label class="field">Ángulo de tono<input type="range" min="0" max="360" value="180" id="hue"></label><span id="hue-result"></span></div></section>';
 }
 async function complete(button){
  const key=button.dataset.courseModule;
  if(completed().has(key))return;
  const [id,index]=key.split('-'),course=courses.find(c=>c[0]===id), module=course?.[4][Number(index)];
  if(!module)return;
  button.disabled=true;
  try{
   await api('records',{kind:'academia',title:course[1]+' · '+module[0],value:{courseId:id,moduleKey:key},status:'Completada'});
   await refresh();
   button.textContent='Módulo completado';
   const progress=document.querySelector('#academy-progress');
   if(progress){const bar=progress.nextElementSibling;bar.value=completed().size;progress.textContent=bar.value+' de '+bar.max+' módulos finalizados';}
   toast('Progreso guardado');
  }catch(error){button.disabled=false;throw error;}
 }
 function quiz(form){
  const course=courses.find(c=>c[0]===form.dataset.courseQuiz);
  const answer=new FormData(form).get('answer');
  form.querySelector('[role=status]').textContent=answer===course?.[5][1][0]?'Respuesta correcta.':'Revisa los módulos y vuelve a intentarlo.';
 }
 return {view,complete,quiz};
}
