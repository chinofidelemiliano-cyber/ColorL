const MAX_ROWS=150;
const key=text=>text.trim().toLowerCase();
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const optionalNumber=value=>value===null||finite(value);
const clean=(value,limit=240)=>String(value??'').trim().slice(0,limit);

export function inventoryRows(kind,items){
 if(!['inventario','anilox'].includes(kind)||!Array.isArray(items)||!items.length||items.length>MAX_ROWS)return null;
 const seen=new Set(), rows=[];
 for(const item of items){
  if(!item||typeof item!=='object')return null;
  const title=clean(item.title,100), code=clean(item.code), lot=clean(item.lot);
  if(!title||!code|| (kind==='inventario'&&!lot))return null;
  const identity=JSON.stringify([key(code),key(lot)]);
  if(seen.has(identity))return null;
  seen.add(identity);
  let value;
  if(kind==='inventario'){
   if(!finite(item.quantity)||Math.abs(item.quantity)>1e7||!finite(item.cost)||item.cost<0||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.entryDate)||![item.lifeDays,item.reportedDays,item.reportedTotal].every(optionalNumber))return null;
   value={code,lot,quantity:item.quantity<0?null:item.quantity,reportedQuantity:item.quantity,cost:item.cost,supplier:clean(item.supplier),technology:clean(item.technology),entryDate:item.entryDate,
    lifeDays:item.lifeDays,reportedDays:item.reportedDays,reportedTotal:item.reportedTotal,sourcePage:item.sourcePage===2?2:1,quantityPage:item.quantityPage===4?4:3,
    stockVerified:false};
  }else{
   if(!finite(item.nominal)||item.nominal<=0||!finite(item.lineature)||item.lineature<=0||![item.sourceAporte,item.density].every(optionalNumber))return null;
   value={code,lineature:item.lineature,nominal:item.nominal,sourceAporte:item.sourceAporte,density:item.density,material:clean(item.material),
    notes:clean(item.notes,1000),sourcePage:1};
  }
  rows.push({title,value});
 }
 return rows;
}
