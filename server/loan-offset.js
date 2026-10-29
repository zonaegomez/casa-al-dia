const C=require('../core');
const {randomUUID}=require('node:crypto');
const {expenseRows}=require('../api/close-cycle');
function fail(message,status=409){throw Object.assign(Error(message),{status});}
function remaining(l){return l.amountCents-l.payments.filter(p=>p.status==='confirmed').reduce((s,p)=>s+p.amountCents,0);}
async function offset(db,tx,uid,input,loan,now){
 const prior=loan.events.find(e=>e.id===input.operationId);
 if(prior){if(prior.uid!==uid||prior.action!==input.action)fail('Identificador de operación ocupado');return loan;}
 if(loan.version!==input.expectedVersion)fail('El préstamo cambió. Revisa los datos antes de confirmar.');
 if(loan.status!=='active'||loan.events.length>=500)fail('Se necesita un préstamo activo con movimientos disponibles');
 const next=structuredClone(loan);
 const pending=next.payments.find(p=>p.status==='pending');
 let payment;
 if(input.action==='propose-offset'){
  if(pending)fail('Primero resuelve el movimiento pendiente');
  const n=C.cents(input.amount);
  if(!Number.isSafeInteger(n)||n<=0||n>remaining(loan))fail('El importe supera el préstamo pendiente o no es válido',400);
  payment={id:input.operationId,kind:'offset',status:'pending',amountCents:n,proposedBy:uid,reportedAt:now};
 }else{
  payment=next.payments.find(p=>p.id===input.paymentId&&p.kind==='offset'&&p.status==='pending');
  if(!payment)fail('Compensación pendiente no disponible');
  if(input.action==='confirm-offset'&&uid===payment.proposedBy)fail('La otra persona debe confirmar la compensación',403);
  if(input.action==='reject-offset'){
   payment.status='rejected';payment.resolvedAt=now;
   next.events.push({id:input.operationId,action:input.action,uid,at:now});next.version++;next.updatedAt=now;return next;
  }
 }
 // Both identities must still be enabled and bound to the original members.
 for(const [account,id] of [[loan.lenderUid,loan.lenderId],[loan.borrowerUid,loan.borrowerId]]){
  const a=await tx.get(db.doc('access/'+account)),m=await tx.get(db.doc('members/'+id));
  if(!a.exists||!a.data().enabled||a.data().memberId!==id||!m.exists||m.data().active===false)fail('La vinculación de los participantes requiere revisión',403);
 }
 const configRef=db.doc('settings/config'),configSnap=await tx.get(configRef),config=configSnap.exists?configSnap.data():{};
 const data={};for(const name of ['members','movements','bills','billPayments','billReceipts','settlements']){const snap=await tx.get(db.collection(name));data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));}
 const rows=expenseRows(data.movements,data.bills,data.billPayments,config.legacyParticipantIds||C.participants(data.members),data.billReceipts);
 const direct=C.balances(rows,data.members,data.settlements.filter(s=>!s.voided&&!s.archived)).directTransfers.find(t=>t.fromId===loan.lenderId&&t.toId===loan.borrowerId);
 if(payment.amountCents>remaining(loan)||payment.amountCents>C.cents(direct?.amount||0))fail('La deuda compartida o el préstamo cambiaron. Rechaza la propuesta y revisa el importe.');
 if(input.action==='propose-offset')next.payments.push(payment);
 else{
  const date=C.today(new Date(now)),closed=await tx.get(db.doc('closedCycles/'+C.cycle(date,config.cycleStartDay||1)));
  if(closed.exists)fail('El ciclo de la compensación está cerrado');
  const id='adjustment-'+randomUUID();
  // No loan identifier, principal, title, private history or participant UIDs in public records.
  // No allocationDate: existing Firestore rules forbid unilateral edits to this agreed adjustment.
  const from=data.members.find(m=>m.id===loan.lenderId),to=data.members.find(m=>m.id===loan.borrowerId);
  tx.set(db.doc('settlements/'+id),{fromId:from.id,toId:to.id,fromName:from.name,toName:to.name,amount:payment.amountCents/100,date,kind:'agreed-adjustment',updatedBy:uid});
  tx.set(configRef,{...config,revision:Number(config.revision||0)+1});
  payment.status='confirmed';payment.resolvedAt=now;payment.publicAdjustmentId=id;
  if(remaining(next)===0)next.status='settled';
 }
 next.events.push({id:input.operationId,action:input.action,uid,at:now});next.version++;next.updatedAt=now;return next;
}
module.exports={offset};
