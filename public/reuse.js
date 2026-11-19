import {normalize,parseLab} from './lab-model.js';

export function candidateLots(records, request, delta, today=new Date().toISOString().slice(0,10)){
 const keys=['technology','family','substrate','condition','illuminant'];
 return records.flatMap(record=>{
  const v=record.value;
  if(v.reuseStatus!=='Verificado'||!v.reuseUntil||v.reuseUntil<today||!v.expiry||v.expiry<today||!Number.isFinite(Number(v.quantity))||
    Number(v.quantity)<=0||keys.some(key=>!v[key]||normalize(v[key])!==normalize(request[key])))return [];
  try{
   const distance=delta(request.lab,parseLab(v.lab));
   return Number.isFinite(distance)&&distance<=request.tolerance?[{record,distance,kilograms:Math.min(request.mass,Number(v.quantity))}]:[];
  }catch{return [];}
 }).sort((a,b)=>a.distance-b.distance||b.kilograms-a.kilograms);
}
