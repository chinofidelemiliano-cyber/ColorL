const radians=degrees=>degrees*Math.PI/180;
const signed=value=>(value>=0?'+':'')+value.toFixed(2);
const hueName=degrees=>['rojo','naranja','amarillo','amarillo verdoso','verde','verde azulado','azul','violeta','magenta'][
 Math.round(((degrees+360)%360)/40)%9
];

export function correctionSteps({dl,da,db},accepted){
 if(accepted)return ['La lectura cumple la tolerancia elegida. Conserva la mezcla y las condiciones registradas.'];
 const axes=[
  [dl,'Aumenta la luminosidad','Reduce la luminosidad','L*'],
  [da,'Desplaza hacia el rojo','Desplaza hacia el verde','a*'],
  [db,'Desplaza hacia el amarillo','Desplaza hacia el azul','b*']
 ];
 return axes.filter(([value])=>Math.abs(value)>=.005).sort(([a],[b])=>Math.abs(b)-Math.abs(a))
  .map(([value,positive,negative,axis])=>(value<0?positive:negative)+' ('+axis+' '+signed(-value)+' respecto a la muestra).');
}

export function workshopPlan({dl,da,db,dc},accepted){
 if(accepted)return [];
 const plan=[];
 if(Math.abs(dl)>=.005){
  const darker=dl>0;
  plan.push({
   title:darker?'Para bajar la luminosidad':'Para subir la luminosidad',
   action:darker
    ?(dc<-.005?'Verifica primero si la película impresa quedó demasiado delgada o si la receta tiene exceso de base. Con el aporte correcto, ensaya una versión más concentrada usando la misma mezcla de colorantes.':'Verifica el aporte y la cantidad de base. Con el proceso estable, ensaya más concentrado del mismo tono y comprueba que el croma no se aleje del objetivo.')
    :'Si el sustrato es más claro que la tinta y la mezcla es transparente, ensaya una base transparente compatible para que aparezca más el fondo. Si necesitas conservar la opacidad, ensaya una base blanca compatible y revisa cuánto croma pierdes.',
   check:'Mide L* después de secar o curar la prueba. Revisa también a*, b* y el croma antes de dar por bueno el ajuste.'
  });
 }
 if(Math.abs(da)>=.005||Math.abs(db)>=.005){
  const colors=[...(Math.abs(da)>=.005?[da<0?'rojo':'verde']:[]),...(Math.abs(db)>=.005?[db<0?'amarillo':'azul']:[])];
  const warm=colors.join('/')==='rojo/amarillo';
  plan.push({
   title:'Para corregir el tono',
   action:warm?'Prueba un concentrado rojo cálido compatible en una porción aparte: puede mover ambos ejes hacia el rojo y el amarillo. Si el rojo ya se acerca y aún falta amarillo, prueba ese ajuste en otra porción.':
    'Busca en tu sistema de tintas un concentrado compatible que mueva la prueba hacia '+colors.join(' y ')+'. Si necesitas dos colorantes, pruébalos por separado para ver qué cambia cada uno.',
   check:'Contrasta a* y b* con el patrón. Vuelve a medir L* y ΔE porque un ajuste de tono también puede cambiar la luminosidad.'
  });
 }
 return plan;
}

export function comparisonInspector(pattern,sample,d,accepted,swatches){
 const swatch=(index,color)=>swatches[index]?.hex||color;
 const labels=[['Patrón',pattern,d.c1,d.h1,'#51e7dd'],['Muestra',sample,d.c2,d.h2,'#ff7bc1']];
 const motion=correctionSteps(d,accepted), plan=workshopPlan(d,accepted);
 const host=document.createElement('div');
 host.className='color-inspector';
 host.innerHTML='<section class="color-scene"><h3>Espacio CIELAB</h3>'+
  '<svg viewBox="0 0 480 310" role="img" aria-label="Posición del patrón y de la muestra en el espacio CIELAB"></svg>'+
  '<div class="scene-controls"><label>Rotación <input type="range" min="-180" max="180" value="-32" aria-label="Rotación"></label>'+
  '<label>Inclinación <input type="range" min="-90" max="90" value="20" aria-label="Inclinación"></label>'+
  '<button type="button" class="secondary" data-plane>Ver plano a*–b*</button></div></section>'+
  '<section class="color-readout"><h3>Ubicación de los colores</h3>'+labels.map(([name,lab,c,h,marker],i)=>
  '<article><span class="color-orb" aria-hidden="true" style="--marker:'+marker+';--swatch:'+swatch(i,'var(--surface)')+'"></span>'+
  '<div><strong>'+name+'</strong><p>L* '+lab[0].toFixed(2)+' · a* '+signed(lab[1])+' · b* '+signed(lab[2])+'</p>'+
  '<small>C* '+c.toFixed(2)+' · '+(c<.005?'tono neutro':hueName(h)+' · h° '+h.toFixed(1)+'°')+'</small></div></article>').join('')+
  '<h3>Qué ajustar</h3><ol>'+motion.map(step=>'<li>'+step+'</li>').join('')+'</ol>'+
  (plan.length?'<h3>Cómo ajustarlo en taller</h3><p>Antes de cambiar la receta, compara material, fondo, recubrimiento y aporte con la prueba aprobada.</p>'+
   '<ul class="workshop-plan">'+plan.map(({title,action,check})=>'<li><strong>'+title+'</strong><p>'+action+'</p><p><strong>Comprueba:</strong> '+check+'</p></li>').join('')+'</ul>'+
   '<p>Usa porciones pesadas, separadas de la tinta de producción. Cambia una variable por prueba, registra los gramos y repite la medición en las mismas condiciones. Escala únicamente después de confirmar que el ΔE baja y que la prueba cumple tu tolerancia.</p>'+
   '<p>Para recomendar gramos de una tinta específica hacen falta ensayos comparables de esa mezcla.</p>':'')+
  '</section>';

 const svg=host.querySelector('svg');
 const [turn,tilt]=host.querySelectorAll('input');
 const plane=host.querySelector('[data-plane]');
 const isFlat=()=>Number(tilt.value)===90&&Number(turn.value)===0;
 const extent=Math.max(50,...pattern.slice(1).map(Math.abs),...sample.slice(1).map(Math.abs));
 const points=[pattern,sample];
 function draw(){
  const yaw=radians(Number(turn.value)),pitch=radians(Number(tilt.value));
  const project=([l,a,b])=>{
   const x=a/extent,y=(l-50)/50,z=-b/extent;
   const side=x*Math.cos(yaw)-z*Math.sin(yaw);
   const depth=x*Math.sin(yaw)+z*Math.cos(yaw);
   const up=y*Math.cos(pitch)-depth*Math.sin(pitch);
   return [240+side*106,155-up*101].map(n=>n.toFixed(2));
  };
  const line=(from,to,style)=>'<line x1="'+from[0]+'" y1="'+from[1]+'" x2="'+to[0]+'" y2="'+to[1]+'" class="'+style+'"/>';
  const edge=(a,b)=>line(project(a),project(b),'scene-grid');
  const out=[];
  for(const l of [0,100]){
   for(const k of [-extent,0,extent]){
    out.push(edge([l,k,-extent],[l,k,extent]),edge([l,-extent,k],[l,extent,k]));
   }
  }
  for(const a of [-extent,extent])for(const b of [-extent,extent])out.push(edge([0,a,b],[100,a,b]));
  const axes=[
   [[50,-extent,0],[50,extent,0],'−a* verde','+a* rojo','axis-a'],
   [[50,0,-extent],[50,0,extent],'−b* azul','+b* amarillo','axis-b'],
   [[0,0,0],[100,0,0],'L* 0','L* 100','axis-l']
  ];
  for(const [low,high,lowLabel,highLabel,style] of axes){
   const a=project(low),b=project(high);
   if(Math.hypot(a[0]-b[0],a[1]-b[1])<5)continue;
   out.push(line(a,b,style));
   for(const [[x,y],label] of [[a,lowLabel],[b,highLabel]])out.push('<text x="'+x+'" y="'+y+'" dy="-7" text-anchor="middle" class="'+style+'">'+label+'</text>');
  }
  const [p,m]=points.map(project);
  if(Math.hypot(p[0]-m[0],p[1]-m[1])>8)out.push(line(m,p,'scene-link'));
  labels.forEach(([name,lab,,,color],i)=>{
   const [x,y]=i?m:p;
   out.push(line(project([0,lab[1],lab[2]]),[x,y],'scene-drop'));
   out.push('<circle cx="'+x+'" cy="'+y+'" r="'+(i?6:10)+'" fill="'+swatch(i,color)+'" stroke="'+color+'" stroke-width="2"><title>'+name+'</title></circle>');
  });
  svg.innerHTML=out.join('');
  plane.textContent=isFlat()?'Volver a perspectiva 3D':'Ver plano a*–b*';
 }
 turn.addEventListener('input',draw);tilt.addEventListener('input',draw);
 plane.addEventListener('click',()=>{
  const flat=isFlat();
  turn.value=flat?-32:0;tilt.value=flat?20:90;
  draw();
 });
 let drag;
 svg.addEventListener('pointerdown',event=>{
  drag={x:event.clientX,y:event.clientY,turn:Number(turn.value),tilt:Number(tilt.value)};
  svg.setPointerCapture(event.pointerId);
 });
 svg.addEventListener('pointermove',event=>{
  if(!drag)return;
  turn.value=((drag.turn+(event.clientX-drag.x)*.7+540)%360)-180;
  tilt.value=Math.max(-90,Math.min(90,drag.tilt+(event.clientY-drag.y)*.45));
  draw();
 });
 svg.addEventListener('lostpointercapture',()=>{drag=null;});
 draw();
 return host;
}
