const {authorize,body,fail}=require('../server/firebase');
const C=require('../core');
function expenseRows(movements,bills,payments,legacy){
 const rows=movements.filter(m=>!m.voided&&m.type==='compra').map(m=>({date:m.date,category:m.category||'otro',amount:m.total,memberId:m.memberId,participantIds:m.participantIds||legacy}));
 for(const b of bills){for(const p of (b.history||[]))rows.push({date:p.paidAt,category:'servicio',amount:p.amount,memberId:p.memberId,payers:p.splits,participantIds:p.participantIds||legacy});}
 for(const p of payments.filter(p=>!p.voided))rows.push({date:p.paidAt,category:'servicio',amount:p.amount,memberId:p.memberId,payers:p.splits,participantIds:p.participantIds||legacy});
 return rows;
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 try{
  const {uid,db}=await authorize(req,true);const {cycleKey}=body(req);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(cycleKey||''))return res.status(400).json({error:'Ciclo inválido'});
  const result=await closeCycle(db,uid,cycleKey);return res.status(200).json(result);
 }catch(e){return fail(res,e);}
}
function legacyDate(s,cfg){return s.granularity==='quincenal'?s.periodKey.slice(0,7)+(s.periodKey.endsWith('Q1')?'-01':'-16'):s.periodKey+'-'+String(cfg.cycleStartDay||1).padStart(2,'0');}
async function closeCycle(db,uid,cycleKey,today=C.today()){
 return db.runTransaction(async tx=>{
   const cfgRef=db.doc('settings/config'),closeRef=db.doc('closedCycles/'+cycleKey);
   const cfgSnap=await tx.get(cfgRef),closed=await tx.get(closeRef);if(closed.exists)return closed.data();
   const cfg=cfgSnap.exists?cfgSnap.data():{};
   if(cycleKey>=C.cycle(today,cfg.cycleStartDay||1)){const e=Error('Solo se pueden cerrar ciclos que ya terminaron');e.status=409;throw e;}
   const data={};
   for(const coll of ['members','movements','bills','billPayments','settlements']){const snap=await tx.get(db.collection(coll));data[coll]=snap.docs.map(d=>({id:d.id,...d.data()}));}
   const legacy=cfg.legacyParticipantIds||C.participants(data.members);
   const rows=expenseRows(data.movements,data.bills,data.billPayments,legacy).filter(r=>C.cycle(r.date,cfg.cycleStartDay||1)===cycleKey);
   const settlements=data.settlements.filter(s=>!s.voided&&C.cycle(s.allocationDate||legacyDate(s,cfg),cfg.cycleStartDay||1)===cycleKey);
   const balance=C.balances(rows,data.members,settlements);
   if(balance.unassigned){const e=Error('Hay gastos sin asignar. Corrige sus pagadores o beneficiarios antes de cerrar.');e.status=409;throw e;}
   const byCat={};let total=0;for(const r of rows){const n=C.cents(r.amount);byCat[r.category]=(byCat[r.category]||0)+n;total+=n;}
   for(const key of Object.keys(byCat))byCat[key]/=100;
   const snapshot={cycleKey,total:total/100,byCat,closedAt:C.today(),closedBy:uid,budget:cfg.monthlyBudget||0,budgetByCategory:cfg.budgetByCategory||{},cycleStartDay:cfg.cycleStartDay||1,balances:balance.balances,expenseCount:rows.length,schemaVersion:2};
   tx.set(closeRef,snapshot);tx.set(cfgRef,{...cfg,revision:Number(cfg.revision||0)+1,legacyParticipantIds:legacy,schemaVersion:2});
   tx.set(db.doc('operations/close-'+cycleKey),{kind:'close-cycle',actorUid:uid,createdAt:new Date().toISOString(),paths:['closedCycles/'+cycleKey]});return snapshot;
  });
}
module.exports=handler;module.exports.closeCycle=closeCycle;module.exports.expenseRows=expenseRows;
