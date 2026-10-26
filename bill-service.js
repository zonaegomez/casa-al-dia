(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createBillService=factory;})(globalThis,function({store,C,addMonths}){
 const months={mensual:1,bimestral:2,trimestral:3,anual:12};
 async function schedule(t,bill,id,changedId,changed){
  const ids=[...new Set([...(bill.paymentIds||[]),...(changedId?[changedId]:[])])],payments=[];
  for(const pid of ids){const p=pid===changedId?changed:await t.get('billPayments',pid);if(p&&!p.voided)payments.push(p);}
  const anchor=bill.scheduleAnchor||bill.nextDueDate,step=months[bill.cycle]||1,covered=new Set(payments.map(p=>p.dueDate));let next=anchor;
  for(let i=0;i<1200;i++){next=addMonths(anchor,i*step);if(!covered.has(next))break;if(i===1199)throw Error('Calendario demasiado extenso');}
  await t.put('bills',id,{scheduleAnchor:anchor,paymentIds:ids,nextDueDate:next});
 }
 async function pay(id,input,meta){return store.atomic(meta,async t=>{
  const b=await t.get('bills',id);if(!b||b.archived)throw Error('Servicio no disponible');
  const dueDate=C.date(input.dueDate||b.nextDueDate);if(dueDate!==b.nextDueDate)throw Error('El vencimiento cambió. Reabre el formulario para confirmar el recibo vigente.');
  const entry={...input,billId:id,dueDate,period:C.cycle(dueDate,t.config.cycleStartDay||1)};C.number(entry.amount,'Pago',true);
  await t.put('billPayments',t.id,entry,false);await schedule(t,b,id,t.id,entry);return t.id;
 });}
 async function edit(billId,pid,patch,meta){return store.atomic(meta,async t=>{
  const b=await t.get('bills',billId),p=await t.get('billPayments',pid);if(!b||!p||p.voided||p.billId!==billId)throw Error('Pago no disponible');
  if(p.scheduleUnverified)throw Error('El calendario de este pago antiguo requiere conciliación antes de editarlo o anularlo');
  const next={...p,...patch};await t.put('billPayments',pid,next,false);await schedule(t,b,billId,pid,next);
 });}
 return {pay,edit};
});
