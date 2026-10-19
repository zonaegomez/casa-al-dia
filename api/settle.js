const {authorize,body,fail}=require('../server/firebase');const C=require('../core');const {expenseRows}=require('./close-cycle');
async function settle(db,uid,input){
 const {fromId,toId,expectedRevision,operationId}=input;let amount;try{amount=C.money(input.amount);}catch{const e=Error('Monto inválido');e.status=400;throw e;}
 if(!fromId||!toId||fromId===toId||amount<=0||!Number.isInteger(expectedRevision)||typeof operationId!=='string'||!/^settlement-[A-Za-z0-9_-]{1,220}$/.test(operationId)){const e=Error('Transferencia inválida');e.status=400;throw e;}
 return db.runTransaction(async tx=>{
  const receipt=db.doc('operations/'+operationId),receiptSnap=await tx.get(receipt);if(receiptSnap.exists)return receiptSnap.data().result;
  const configRef=db.doc('settings/config'),configSnap=await tx.get(configRef),config=configSnap.exists?configSnap.data():{};
  if(Number(config.revision||0)!==expectedRevision){const e=Error('Las cuentas cambiaron. Revisa el saldo actualizado antes de confirmar.');e.status=409;throw e;}
  const data={};for(const name of ['members','movements','bills','billPayments','settlements']){const snap=await tx.get(db.collection(name));data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));}
  const legacy=config.legacyParticipantIds||C.participants(data.members),rows=expenseRows(data.movements,data.bills,data.billPayments,legacy);
  const balance=C.balances(rows,data.members,data.settlements.filter(s=>!s.voided)),from=balance.balances.find(b=>b.member.id===fromId),to=balance.balances.find(b=>b.member.id===toId);
  if(!from||!to||C.cents(amount)>Math.round(-from.balance*100)||C.cents(amount)>Math.round(to.balance*100)){const e=Error('El importe ya no corresponde al saldo pendiente de estas personas. Actualiza la vista.');e.status=409;throw e;}
  const date=C.today(),closed=await tx.get(db.doc('closedCycles/'+C.cycle(date,config.cycleStartDay||1)));
  if(closed.exists){const e=Error('El ciclo actual está cerrado; revisa la configuración antes de registrar transferencias.');e.status=409;throw e;}
  const result={fromId,toId,fromName:from.member.name,toName:to.member.name,amount,date,allocationDate:date,updatedBy:uid};
  tx.set(db.doc('settlements/'+operationId),result);tx.set(configRef,{...config,legacyParticipantIds:legacy,revision:expectedRevision+1});tx.set(receipt,{kind:'settlement',actorUid:uid,createdAt:new Date().toISOString(),paths:['settlements/'+operationId],result});return result;
 });
}
async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});try{const {uid,db}=await authorize(req);return res.status(200).json(await settle(db,uid,body(req)));}catch(e){return fail(res,e);}}
module.exports=handler;module.exports.settle=settle;
