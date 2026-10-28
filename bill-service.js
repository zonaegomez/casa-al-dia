(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createBillService=factory;})(globalThis,function({store,C,addMonths,members}){
 const months={mensual:1,bimestral:2,trimestral:3,anual:12};
 async function schedule(t,bill,id,changedId,changed){
  const ids=[...new Set([...(bill.paymentIds||[]),...(changedId?[changedId]:[])])],payments=[];
  for(const pid of ids){const p=pid===changedId?changed:await t.get('billPayments',pid);if(p&&!p.voided)payments.push(p);}
  const anchor=bill.scheduleAnchor||bill.nextDueDate,step=months[bill.cycle]||1,covered=new Set(payments.filter(p=>!p.receiptId).map(p=>p.dueDate));
  for(const rid of [...new Set(payments.filter(p=>p.receiptId).map(p=>p.receiptId))]){const r=await t.get('billReceipts',rid);if(r&&C.cents(C.receiptProgress({...r,id:rid},payments).pending)===0)covered.add(r.dueDate);}
  let next=anchor;
  for(let i=0;i<1200;i++){next=addMonths(anchor,i*step);if(!covered.has(next))break;if(i===1199)throw Error('Calendario demasiado extenso');}
  await t.put('bills',id,{scheduleAnchor:anchor,paymentIds:ids,nextDueDate:next});
 }
 async function registerReceipt(id,input,meta){return store.atomic(meta,async t=>{
  const b=await t.get('bills',id);if(!b||b.archived)throw Error('Servicio no disponible');
  const dueDate=C.date(input.dueDate);if(dueDate!==b.nextDueDate)throw Error('El vencimiento cambió. Reabre el formulario.');
  const amount=C.money(input.amount);C.number(amount,'Total del recibo',true);
  const receiptId=id+'-'+dueDate,existing=await t.get('billReceipts',receiptId);
  if(existing){if(C.cents(existing.amount)!==C.cents(amount))throw Error('El recibo ya tiene un importe confirmado');return receiptId;}
  if((b.history||[]).length)throw Error('Migra y concilia el historial antes de registrar recibos nuevos');
  const ids=b.participantIds||(members?C.participants(members()):[]),beneficiaryShares=C.billShares(b,amount,ids);
  if(!beneficiaryShares.length||beneficiaryShares.some(p=>!(members?members():[]).some(m=>m.id===p.memberId&&m.active!==false)))throw Error('Revisa los integrantes activos del servicio');
  await t.put('billReceipts',receiptId,{billId:id,name:b.name,amount,dueDate,period:dueDate.slice(0,7),participantIds:beneficiaryShares.map(p=>p.memberId),beneficiaryShares},false);
  return receiptId;
 });}
 async function pay(id,input,meta){return store.atomic(meta,async t=>{
  const b=await t.get('bills',id);if(!b||b.archived)throw Error('Servicio no disponible');
  const dueDate=C.date(input.dueDate||b.nextDueDate);if(dueDate!==b.nextDueDate)throw Error('El vencimiento cambió. Reabre el formulario para confirmar el recibo vigente.');
  let receipt=null,receiptId=null;
  if(input.receiptTotal!=null){
   receiptId=id+'-'+dueDate;receipt=await t.get('billReceipts',receiptId);const isNewReceipt=!receipt;
   if(!receipt){
    if((b.history||[]).length)throw Error('Migra y concilia el historial antes de registrar recibos nuevos');
    const ids=b.participantIds||(members?C.participants(members()):input.participantIds);
    const amount=C.money(input.receiptTotal);C.number(amount,'Total del recibo',true);
    const beneficiaryShares=C.billShares(b,amount,ids);
    receipt={billId:id,name:b.name,amount,dueDate,period:dueDate.slice(0,7),participantIds:beneficiaryShares.map(p=>p.memberId),beneficiaryShares};
   }else if(C.cents(input.receiptTotal)!==C.cents(receipt.amount))throw Error('El recibo ya tiene un importe confirmado; no cambies su total al registrar una aportación');
   const previous=[];for(const pid of b.paymentIds||[]){const p=await t.get('billPayments',pid);if(p)previous.push(p);}
   if(C.cents(input.amount)>C.cents(C.receiptProgress({...receipt,id:receiptId},previous).pending))throw Error('La aportación excede el pendiente del recibo');
   const held=(t.config.financePlan?.contributions||[]).filter(x=>!x.voided&&!x.forwardedPaymentId&&x.receiptId===receiptId).reduce((s,x)=>s+C.cents(x.rent),0);
   if(C.cents(input.amount)>C.cents(C.receiptProgress({...receipt,id:receiptId},previous).pending)-held)throw Error('Hay dinero recibido para este recibo. Usa Pagar con aportaciones recibidas para aplicarlo sin duplicarlo.');
   const payerIds=(input.splits?.length?input.splits:[{memberId:input.memberId}]).map(p=>p.memberId);
   if(payerIds.some(pid=>!(members?members():[]).some(m=>m.id===pid&&m.active!==false)))throw Error('Selecciona pagadores activos');
   if(isNewReceipt)await t.put('billReceipts',receiptId,receipt,false);
  }
  const entry={...input,...(receiptId?{receiptId}:{}),billId:id,dueDate,period:C.cycle(dueDate,t.config.cycleStartDay||1)};C.number(entry.amount,'Pago',true);
  await t.put('billPayments',t.id,entry,false);await schedule(t,b,id,t.id,entry);return t.id;
 });}
 async function edit(billId,pid,patch,meta){return store.atomic(meta,async t=>{
  const b=await t.get('bills',billId),p=await t.get('billPayments',pid);if(!b||!p||p.voided||p.billId!==billId)throw Error('Pago no disponible');
  if(p.scheduleUnverified)throw Error('El calendario de este pago antiguo requiere conciliación antes de editarlo o anularlo');
  if(p.receiptId){if(!patch.voided)throw Error('Para corregir una aportación, anúlala y captura la correcta');const receipt=await t.get('billReceipts',p.receiptId);if(!receipt)throw Error('Falta el recibo de origen');}
  if(p.collectedContributionIds?.length){
   if(!patch.voided)throw Error('El pago con aportaciones se corrige anulándolo primero');
   const plan=t.config.financePlan;if(!plan)throw Error('Falta el plan de origen');
   await t.put('settings','config',{financePlan:{...plan,contributions:(plan.contributions||[]).map(x=>x.forwardedPaymentId===pid?{...x,forwardedPaymentId:null}:x)}});
  }
  const next={...p,...patch};await t.put('billPayments',pid,next,false);await schedule(t,b,billId,pid,next);
 });}
 async function payCollected(receiptId,paidAt,meta){return store.atomic(meta,async t=>{
  C.date(paidAt);if(paidAt>C.today())throw Error('No registres pagos futuros');
  const receipt=await t.get('billReceipts',receiptId);if(!receipt)throw Error('Recibo no disponible');
  const bill=await t.get('bills',receipt.billId);if(!bill||bill.archived)throw Error('Servicio no disponible');
  const plan=t.config.financePlan,contributions=(plan?.contributions||[]).filter(x=>!x.voided&&!x.forwardedPaymentId&&x.receiptId===receiptId&&x.rent>0);
  if(!contributions.length)throw Error('No hay aportaciones recibidas por aplicar');
  const previous=[];for(const id of bill.paymentIds||[]){const p=await t.get('billPayments',id);if(p)previous.push(p);}
  const totals=new Map();for(const p of contributions)totals.set(p.memberId,(totals.get(p.memberId)||0)+C.cents(p.rent));
  const splits=[...totals].map(([memberId,n])=>({memberId,amount:n/100})),amount=splits.reduce((s,p)=>s+C.cents(p.amount),0)/100;
  if(C.cents(amount)>C.cents(C.receiptProgress({...receipt,id:receiptId},previous).pending))throw Error('Las aportaciones superan el pendiente. Concilia el recibo antes de aplicarlas.');
  if(contributions.some(p=>p.date>paidAt))throw Error('La fecha de pago al proveedor no puede ser anterior a la recepción de estos fondos');
  const entry={billId:receipt.billId,receiptId,dueDate:receipt.dueDate,period:C.cycle(receipt.dueDate,t.config.cycleStartDay||1),paidAt,amount,participantIds:receipt.participantIds,splits,memberId:null,memberName:'Aportaciones recibidas',executedByMemberId:plan.creditorId,collectedContributionIds:contributions.map(x=>x.id)};
  await t.put('settings','config',{financePlan:{...plan,contributions:plan.contributions.map(x=>contributions.some(p=>p.id===x.id)?{...x,forwardedPaymentId:t.id}:x)}});
  await t.put('billPayments',t.id,entry,false);await schedule(t,bill,receipt.billId,t.id,entry);return t.id;
 });}
 return {registerReceipt,pay,edit,payCollected};
});

