import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryRows} from '../inventory-api.js';
import {parseInventoryPages} from '../public/inventory-import.js';
import {context,linkInventory,lotCost} from '../public/lab-model.js';
import {BCM_TO_CM3_M2,estimateInk} from '../public/print-calculations.js';

const cell=(str,x,y)=>({str,width:1,transform:[1,0,0,1,x,y]});
const row=(values,x,y)=>values.map((value,index)=>cell(value,x[index],y));
test('reúne lotes y existencias por línea y conserva inconsistencias del documento',()=>{
 const data=(code,y)=>row(['Tinta',code,'Base Agua','Proveedor','L-'+code,'10/11/2026','180'],[70,137,211,260,333,393,467],y);
 const balance=(grams,y)=>row(['180','50.00','10.00',grams],[75,145,205,267],y);
 const pages=[[cell('LOTE',330,730),...data('A1',710)],data('A2',725),[cell('G ACTUAL',265,730),...balance('200',710)],balance('-2,000',725)];
 const imported=parseInventoryPages(pages,'inventario');
 assert.deepEqual(imported.map(item=>item.quantity),[.2,-2]);
 const [a,b]=inventoryRows('inventario',imported);
 assert.equal(a.value.stockVerified,false);
 assert.equal(b.value.quantity,null);
 assert.equal(b.value.reportedQuantity,-2);
 assert.equal(inventoryRows('inventario',[imported[0],imported[0]]),null);
 assert.throws(()=>parseInventoryPages([...pages.slice(0,3),[]],'inventario'));
});
test('conserva el dato de aporte original del anilox sin convertirlo a BCM real',()=>{
 const pages=[[...row(['ID','LINEAJE','BCM','APORTE REAL','MATERIAL','DENSIDAD'],[56,90,135,178,230,286],730),
  ...row(['AX1','225','6.7','360','Cerámico','1.64'],[56,90,135,178,230,286],710)],
 [cell('NOTAS',56,730),cell('Rayas',119,710)]];
 const [record]=inventoryRows('anilox',parseInventoryPages(pages,'anilox'));
 assert.equal(record.value.sourceAporte,360);
 assert.equal(record.value.real,undefined);
 assert.equal(record.value.notes,'Rayas');
});
test('limita stock y costo a lotes verificados y vigentes',()=>{
 const ink={id:1,value:{code:'a',technology:'UV',requiresVerifiedLots:true}};
 const lot={value:{code:'A',technology:'UV',stockVerified:true,expiry:'2026-11-30',quantity:2,cost:100,currency:'MXN'}};
 const [linked]=linkInventory([ink],[lot,{value:{...lot.value,expiry:'2026-11-01'}}],'2026-11-19');
 assert.equal(linked.value.stockGrams,2000);
 assert.deepEqual(lotCost([{id:1,grams:500}],[linked]),{amount:50,currency:'MXN'});
 assert.equal(linkInventory([ink],[])[0].value.available,false);
 assert.throws(()=>context({technology:'UV',substrate:'Papel',anilox:'A',bcm:1,condition:'M1',illuminant:'D50',ph:20}));
});
test('el consumo considera una eficiencia de transferencia explícita',()=>{
 const output=estimateInk({area:1000,bcm:4,coverage:50,transfer:25,density:1,unitCost:100,labels:10000});
 assert.ok(Math.abs(output.kilograms-.5*BCM_TO_CM3_M2)<1e-10);
 assert.equal(output.perThousand,output.cost/10);
 assert.throws(()=>estimateInk({area:100,bcm:4,coverage:50,transfer:101,density:1}));
});
