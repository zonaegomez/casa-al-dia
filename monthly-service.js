/* A transfer received by a household collector is not yet a supplier payment. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createMonthlyService=factory;})(globalThis,function({store,C,F}){
 const rows=p=>(p.contributions||[]).filter(x=>!x.voided);
 function held(plan,receiptId,memberId){return rows(plan).filter(x=>x.receiptId===receiptId&&!x.forwardedPaymentId&&(!memberId||x.memberId===memberId)).reduce((s,x)=>s+C.cents(x.rent),0)/100;}
 async function receive(input,meta){return store.atomic(meta,async t=>{
  let plan=t.config.financePlan;if(!plan)throw Error('Configura el plan de pagos primero');
  const member=plan.rows.find(r=>r.memberId===input.memberId);if(!member)throw Error('Integrante fuera del plan');
  const date=C.date(input.date);if(date>C.today())throw Error('No registres aportaciones futuras');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))throw Error('Mes inválido');
  const index=plan.dates.findIndex(d=>d.slice(0,7)===input.month);
  const parts={entry:C.money(input.entry),equipment:C.money(input.equipment),rent:C.money(input.rent)},total=Object.values(parts).reduce((s,n)=>s+C.cents(n),0)/100;
  C.number(total,'Aportación',true);if(C.cents(total)!==C.cents(input.total))throw Error('El importe recibido debe coincidir con el desglose');
  if((plan.contributions||[]).length>=1000)throw Error('El historial de aportaciones requiere conciliación');
  let receipt=null;
  if(parts.rent){
   receipt=await t.get('billReceipts',input.receiptId);if(!receipt||receipt.dueDate.slice(0,7)!==input.month)throw Error('Selecciona un recibo confirmado del mes de la aportación');
   const bill=await t.get('bills',receipt.billId);if(!bill||bill.archived)throw Error('Servicio no disponible');
   const payments=[];for(const id of bill.paymentIds||[]){const p=await t.get('billPayments',id);if(p)payments.push(p);}
   const progress=C.receiptProgress({...receipt,id:input.receiptId},payments),quota=progress.members.find(r=>r.memberId===input.memberId);
   const remaining=quota?Math.max(0,C.cents(quota.pending)-C.cents(held(plan,input.receiptId,input.memberId))):0;
   const available=Math.max(0,C.cents(progress.pending)-C.cents(held(plan,input.receiptId)));
   if(C.cents(parts.rent)>Math.min(remaining,available))throw Error('La renta supera la cuota pendiente o el recibo ya fue pagado. Si hubo un adelanto, usa Saldo entre integrantes para reembolsarlo.');
   C.date(receipt.dueDate);
   const closed=await t.get('closedCycles',C.cycle(receipt.dueDate,t.config.cycleStartDay||1));if(closed)throw Error('El ciclo del recibo está cerrado');
  }
  for(const kind of ['entry','equipment'])if(parts[kind]){
   if(index<0)throw Error('No hay cuotas del plan en este mes');
   plan=F.pay(plan,{memberId:input.memberId,kind,index,date,id:t.id+'-'+kind,amount:parts[kind]});
   plan.payments.at(-1).contributionId=t.id;
  }
  const contribution={id:t.id,memberId:input.memberId,recipientId:plan.creditorId,date,month:input.month,index,...parts,total,...(receipt?{receiptId:input.receiptId,billId:receipt.billId,dueDate:receipt.dueDate}:{}),forwardedPaymentId:null};
  plan={...plan,contributions:[...(plan.contributions||[]),contribution]};
  await t.put('settings','config',{financePlan:plan,revision:Number(t.config.revision||0)+1});return t.id;
 });}
 async function reverse(id,meta){return store.atomic(meta,async t=>{
  const plan=t.config.financePlan,p=plan?.contributions?.find(x=>x.id===id&&!x.voided);if(!p)throw Error('Aportación no disponible');
  if(p.forwardedPaymentId)throw Error('La renta de esta aportación ya fue aplicada al proveedor. Anula primero ese pago desde Servicios.');
  if(p.receiptId){const closed=await t.get('closedCycles',C.cycle(p.dueDate,t.config.cycleStartDay||1));if(closed)throw Error('El ciclo del recibo está cerrado');}
  const updated={...plan,contributions:plan.contributions.map(x=>x.id===id?{...x,voided:true,reversalOperationId:t.id}:x),payments:plan.payments.map(x=>x.contributionId===id?{...x,voided:true,reversalOperationId:t.id}:x)};
  await t.put('settings','config',{financePlan:updated,revision:Number(t.config.revision||0)+1});return id;
 });}
 return {held,receive,reverse};
});
