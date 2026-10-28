/* Household opening obligations. Repayments never create a second expense. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CasaFinance=factory();})(globalThis,function(){
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 const cents=n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>=100000000)throw Error('Importe inválido');return Math.round(n*100);};
 function schedule(total,base,count){const t=cents(total),b=cents(base);if(!Number.isInteger(count)||count<1||count>60||b*(count-1)>t)throw Error('Cuotas inválidas');return Array.from({length:count},(_,i)=>(i===count-1?t-b*(count-1):b)/100);}
 function create(input,members){
  if(!validDate(input.startDate)||!input.startDate.endsWith('-15'))throw Error('Elige un inicio válido el día 15');
  if(!members.some(m=>m.id===input.creditorId&&m.active!==false))throw Error('Selecciona quién adelantó el dinero');
  const ids=input.rows.map(r=>r.memberId);if(ids.length!==3||new Set(ids).size!==3||!ids.includes(input.creditorId)||ids.some(id=>!members.some(m=>m.id===id&&m.active!==false)))throw Error('Selecciona tres integrantes distintos');
  const equipment=cents(input.equipmentTotal),base=cents(input.equipmentMonthly);if(!equipment||!base)throw Error('Captura el total y la cuota del equipo');
  const each=Math.floor(equipment/3),rows=input.rows.map(r=>{if(!cents(r.rent)||!cents(r.entryTotal))throw Error('Captura renta y aportación de entrada mayores a cero');const own=each+(r.memberId===input.creditorId?equipment-each*3:0);const entry=r.memberId===input.creditorId?0:cents(r.entryTotal);return {memberId:r.memberId,rent:r.rent,entryTotal:r.entryTotal,entry:schedule(entry/100,Math.round(entry/6)/100,6),equipment:schedule(own/100,base/100,6)};});
  const dates=Array.from({length:6},(_,i)=>{const [y,m]=input.startDate.split('-').map(Number),d=new Date(Date.UTC(y,m-1+i,15));return d.toISOString().slice(0,10);});
  const payments=input.firstPaid?rows.flatMap(r=>['entry','equipment'].filter(k=>r[k][0]>0).map(kind=>({id:'opening-'+r.memberId+'-'+kind,memberId:r.memberId,kind,index:0,amount:r[kind][0],date:dates[0],opening:true}))):[];
  return {version:1,creditorId:input.creditorId,dates,rows,equipmentTotal:input.equipmentTotal,payments,providerPayments:[]};
 }
 function paid(plan,id,kind,index){return plan.payments.filter(p=>!p.voided&&p.memberId===id&&p.kind===kind&&p.index===index).reduce((s,p)=>s+cents(p.amount),0)/100;}
 function remaining(plan,row,kind){return Math.max(0,row[kind].reduce((s,n)=>s+cents(n),0)-plan.payments.filter(p=>!p.voided&&p.memberId===row.memberId&&p.kind===kind).reduce((s,p)=>s+cents(p.amount),0))/100;}
 function pay(plan,{memberId,kind,index,date,id,amount}){if(!['entry','equipment','provider'].includes(kind)||!Number.isInteger(index)||index<0||index>=6||!validDate(date))throw Error('Pago inválido');
  if(plan.payments.length+plan.providerPayments.length>=500)throw Error('El historial del plan alcanzó su límite; solicita conciliación antes de continuar');const next=JSON.parse(JSON.stringify(plan));if(kind==='provider'){const expected=plan.rows.reduce((s,r)=>s+cents(r.equipment[index]),0)/100;if(plan.providerPayments.some(p=>!p.voided&&p.index===index))throw Error('Esta cuota del crédito ya está registrada');if(cents(amount)!==cents(expected))throw Error('El pago debe coincidir con la cuota del crédito');next.providerPayments.push({id,index,date,amount});}
  else{const row=plan.rows.find(r=>r.memberId===memberId);if(!row||!row[kind][index])throw Error('Cuota no disponible');const pending=Math.max(0,cents(row[kind][index])-cents(paid(plan,memberId,kind,index)));if(!pending||cents(amount)!==pending)throw Error('La cuota cambió o ya está pagada');next.payments.push({id,memberId,kind,index,date,amount});}return next;
 }
 function reverse(plan,id,operationId){const next=JSON.parse(JSON.stringify(plan)),p=[...next.payments,...next.providerPayments].find(x=>x.id===id);if(!p||p.voided)throw Error('Abono no disponible');p.voided=true;p.reversalOperationId=operationId;return next;}
 return {create,schedule,paid,remaining,pay,reverse};
});
