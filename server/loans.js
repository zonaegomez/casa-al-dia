const C=require('../core');
const {offset}=require('./loan-offset');
function error(message,status=400){throw Object.assign(Error(message),{status});}
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
function amount(value){let n;try{n=C.cents(value);}catch{error('Importe inválido');}if(!Number.isSafeInteger(n)||n<=0||n>=10000000000)error('Importe inválido');return n;}
function outstanding(loan){return loan.amountCents-(loan.payments||[]).filter(p=>p.status==='confirmed').reduce((s,p)=>s+p.amountCents,0);}
function transition(loan,uid,input,now){
 if(!loan.participantUids.includes(uid))error('Préstamo no disponible',403);
 if(loan.events.some(e=>e.id===input.operationId))return loan;
 if(loan.version!==input.expectedVersion)error('El préstamo cambió. Revisa los datos antes de confirmar.',409);
 if(loan.events.length>=500)error('Este préstamo alcanzó el límite de movimientos');
 const next=structuredClone(loan),event={id:input.operationId,action:input.action,uid,at:now};
 if(['accept','reject','cancel'].includes(input.action)){
  if(loan.status!=='pending')error('Esta solicitud ya fue resuelta',409);
  if(input.action==='cancel'?uid!==loan.createdBy:uid===loan.createdBy)error('Esta confirmación corresponde a la otra persona',403);
  next.status=input.action==='accept'?'active':input.action==='reject'?'rejected':'cancelled';
 }else if(input.action==='payment'){
  if(loan.status!=='active'||uid!==loan.borrowerUid)error('Solo quien debe puede reportar una devolución de un préstamo activo',403);
  if(loan.payments.some(p=>p.status==='pending'))error('Primero debe resolverse el abono pendiente',409);
  const cents=amount(input.amount);if(cents>outstanding(loan))error('El abono supera lo pendiente');
  next.payments.push({id:input.operationId,amountCents:cents,status:'pending',reportedAt:now});
 }else if(['confirm-payment','reject-payment'].includes(input.action)){
  if(loan.status!=='active'||uid!==loan.lenderUid)error('Solo quien prestó puede confirmar la recepción del abono',403);
  const p=next.payments.find(p=>p.id===input.paymentId&&p.status==='pending');if(!p||p.kind==='offset')error('Abono pendiente no disponible',409);
  p.status=input.action==='confirm-payment'?'confirmed':'rejected';p.resolvedAt=now;
  if(outstanding(next)===0)next.status='settled';
 }else error('Acción inválida');
 next.events.push(event);next.version++;next.updatedAt=now;return next;
}
async function operate(db,uid,input){
 if(!validId(input.operationId)||!validId(input.loanId))error('Identificador inválido');
 const ref=db.doc('privateLoans/'+input.loanId),now=new Date().toISOString();
 return db.runTransaction(async tx=>{
  // Recheck authorization within the transaction: client-selected household actors never identify a borrower.
  const access=await tx.get(db.doc('access/'+uid));if(!access.exists||access.data().enabled!==true)error('Cuenta sin autorización',403);
  const binding=access.data().memberId;if(!validId(binding))error('Tu cuenta aún no está vinculada a un integrante',403);
  const ownMember=await tx.get(db.doc('members/'+binding));if(!ownMember.exists||ownMember.data().active===false)error('Integrante no disponible',403);
  const existing=await tx.get(ref);let next;
  if(existing.exists){
   const loan=existing.data();
   if(!loan.participantUids.includes(uid))error('Préstamo no disponible',403);
   if((uid===loan.lenderUid?loan.lenderId:loan.borrowerId)!==binding)error('La vinculación de tu cuenta cambió. Requiere revisión.',403);
   if(input.action==='create'){
    if(loan.createdBy!==uid||loan.events[0].id!==input.operationId)error('Identificador ocupado',409);
    return {loanId:input.loanId,status:loan.status};
   }
   next=['propose-offset','confirm-offset','reject-offset'].includes(input.action)?await offset(db,tx,uid,input,loan,now):transition(loan,uid,input,now);
  }else{
   if(input.action!=='create')error('Préstamo no disponible',404);
   if(!validId(input.otherMemberId)||input.otherMemberId===binding||!['lend','borrow'].includes(input.direction))error('Elige otra persona y quién prestó');
   const counterpart=await tx.get(db.doc('members/'+input.otherMemberId));if(!counterpart.exists||counterpart.data().active===false)error('Integrante no disponible');
   const accounts=await tx.get(db.collection('access').where('memberId','in',[binding,input.otherMemberId]));
   const enabled=accounts.docs.filter(d=>d.data().enabled===true),own=enabled.filter(d=>d.data().memberId===binding),other=enabled.filter(d=>d.data().memberId===input.otherMemberId);
   if(own.length!==1||own[0].id!==uid||other.length!==1)error('Cada participante necesita una sola cuenta habilitada y vinculada',409);
   const otherUid=other[0].id,lend=input.direction==='lend',principal=amount(input.amount);
   const title=typeof input.title==='string'?input.title.trim():'';if(!title||title.length>160)error('Describe el préstamo en hasta 160 caracteres');
   next={participantUids:[uid,otherUid],lenderUid:lend?uid:otherUid,borrowerUid:lend?otherUid:uid,lenderId:lend?binding:input.otherMemberId,borrowerId:lend?input.otherMemberId:binding,lenderName:lend?ownMember.data().name:counterpart.data().name,borrowerName:lend?counterpart.data().name:ownMember.data().name,title,amountCents:principal,status:'pending',createdBy:uid,createdAt:now,updatedAt:now,version:1,payments:[],events:[{id:input.operationId,action:'create',uid,at:now}]};
  }
  tx.set(ref,next);return {loanId:input.loanId,status:next.status};
 });
}
module.exports={operate,transition,outstanding};

