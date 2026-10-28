/* Household opening obligations. Repayments never create a second expense. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CasaFinance=factory();})(globalThis,function(){
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 const cents=n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>=100000000)throw Error('Importe inválido');return Math.round(n*100);};
 const label=(s,fallback)=>{if(s==null||!String(s).trim())return fallback;if(typeof s!=='string'||s.trim().length>80)throw Error('Usa un nombre de hasta 80 caracteres');return s.trim();};
 function schedule(total,base,count){const t=cents(total),b=cents(base);if(!Number.isInteger(count)||count<1||count>60||b*(count-1)>t)throw Error('Las cuotas exceden el total o el plazo no es válido');return Array.from({length:count},(_,i)=>(i===count-1?t-b*(count-1):b)/100);}
 function create(input,members){
  if(!validDate(input.startDate))throw Error('Elige una fecha de primera cuota válida');
  const count=input.installmentCount??6;if(!Number.isInteger(count)||count<1||count>60)throw Error('Elige entre 1 y 60 cuotas mensuales');
  if(!members.some(m=>m.id===input.creditorId&&m.active!==false))throw Error('Selecciona quién adelantó el dinero');
  const ids=input.rows.map(r=>r.memberId);if(ids.length<2||ids.length>20||new Set(ids).size!==ids.length||!ids.includes(input.creditorId)||ids.some(id=>!members.some(m=>m.id===id&&m.active!==false)))throw Error('Selecciona entre 2 y 20 integrantes distintos, incluyendo a quien adelantó');
  const equipment=cents(input.equipmentTotal),base=input.equipmentMonthly?cents(input.equipmentMonthly):null;
  const each=Math.floor(equipment/ids.length),rows=input.rows.map(r=>{cents(r.rent);cents(r.entryTotal);const own=each+(r.memberId===input.creditorId?equipment-each*ids.length:0);const entry=r.memberId===input.creditorId?0:cents(r.entryTotal);return {memberId:r.memberId,rent:r.rent,entryTotal:r.entryTotal,entry:schedule(entry/100,Math.min(Math.round(entry/count),Math.floor(entry/Math.max(1,count-1)))/100,count),equipment:schedule(own/100,(own?(base??Math.floor(own/count)):0)/100,count)};});
  if(!equipment&&!rows.some(r=>r.entry.some(n=>n>0)))throw Error('Captura al menos un saldo por devolver o una compra financiada');
  const dates=Array.from({length:count},(_,i)=>{const [y,m,day]=input.startDate.split('-').map(Number),last=new Date(Date.UTC(y,m+i,0)).getUTCDate(),d=new Date(Date.UTC(y,m-1+i,Math.min(day,last)));return d.toISOString().slice(0,10);});
  const payments=input.firstPaid?rows.flatMap(r=>['entry','equipment'].filter(k=>r[k][0]>0).map(kind=>({id:'opening-'+r.memberId+'-'+kind,memberId:r.memberId,kind,index:0,amount:r[kind][0],date:dates[0],opening:true}))):[];
  return {version:2,entryLabel:label(input.entryLabel,'Saldo por devolver'),equipmentLabel:label(input.equipmentLabel,'Compra financiada'),creditorId:input.creditorId,dates,rows,equipmentTotal:input.equipmentTotal,payments,providerPayments:[]};
 }
 function paid(plan,id,kind,index){return plan.payments.filter(p=>!p.voided&&p.memberId===id&&p.kind===kind&&p.index===index).reduce((s,p)=>s+cents(p.amount),0)/100;}
 function remaining(plan,row,kind){return Math.max(0,row[kind].reduce((s,n)=>s+cents(n),0)-plan.payments.filter(p=>!p.voided&&p.memberId===row.memberId&&p.kind===kind).reduce((s,p)=>s+cents(p.amount),0))/100;}
 function pay(plan,{memberId,kind,index,date,id,amount}){if(!['entry','equipment','provider'].includes(kind)||!Number.isInteger(index)||index<0||index>=plan.dates.length||!validDate(date))throw Error('Pago inválido');
  if(plan.payments.length+plan.providerPayments.length>=5000)throw Error('El historial del plan alcanzó su límite; solicita conciliación antes de continuar');const next=JSON.parse(JSON.stringify(plan));if(kind==='provider'){const expected=plan.rows.reduce((s,r)=>s+cents(r.equipment[index]),0)/100;if(!expected)throw Error('No hay un pago externo previsto en esta cuota');if(plan.providerPayments.some(p=>!p.voided&&p.index===index))throw Error('Esta cuota externa ya está registrada');if(cents(amount)!==cents(expected))throw Error('El pago debe coincidir con la cuota externa');next.providerPayments.push({id,index,date,amount});}
  else{const row=plan.rows.find(r=>r.memberId===memberId);if(!row||!row[kind][index])throw Error('Cuota no disponible');const pending=Math.max(0,cents(row[kind][index])-cents(paid(plan,memberId,kind,index)));if(!pending||cents(amount)!==pending)throw Error('La cuota cambió o ya está pagada');next.payments.push({id,memberId,kind,index,date,amount});}return next;
 }
 function reverse(plan,id,operationId){const next=JSON.parse(JSON.stringify(plan)),p=[...next.payments,...next.providerPayments].find(x=>x.id===id);if(!p||p.voided)throw Error('Abono no disponible');p.voided=true;p.reversalOperationId=operationId;return next;}
 function rename(plan,entry,equipment){return {...plan,entryLabel:label(entry,'Saldo por devolver'),equipmentLabel:label(equipment,'Compra financiada')};}
 return {create,schedule,paid,remaining,pay,reverse,rename};
});
