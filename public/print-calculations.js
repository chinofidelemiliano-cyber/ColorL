export const BCM_TO_CM3_M2=0.001/(0.0254**2);

export function estimateInk(input){
 const {area,bcm,coverage,transfer,density,unitCost,labels}=input;
 if(![area,bcm,coverage,transfer,density].every(Number.isFinite)||area<=0||bcm<=0||density<=0||coverage<0||coverage>100||transfer<=0||transfer>100)
  throw new Error('Revisa el área, BCM, densidad, cobertura y transferencia. Usa porcentajes de 0 a 100 y una transferencia mayor que cero.');
 if((unitCost!=null&&(!Number.isFinite(unitCost)||unitCost<0))||(labels!=null&&(!Number.isInteger(labels)||labels<=0)))
  throw new Error('El costo debe ser positivo o cero y el número de etiquetas debe ser un entero positivo.');
 const capacity=bcm*BCM_TO_CM3_M2;
 const massPerArea=capacity*coverage/100*transfer/100*density;
 const kilograms=area*massPerArea/1000;
 const cost=unitCost==null?null:kilograms*unitCost;
 return {capacity,massPerArea,kilograms,cost,perThousand:cost!=null&&labels!=null?1000*cost/labels:null};
}
