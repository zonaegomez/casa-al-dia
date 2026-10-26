const {services}=require('../server/firebase');const C=require('../core');const {expenseRows}=require('../api/close-cycle');
async function audit(db){
 const all=await db.runTransaction(async tx=>{const data={};for(const coll of ['settings','members','purchases','items','movements','bills','billPayments','closedCycles','settlements','debts']){const s=await tx.get(db.collection(coll));data[coll]=s.docs.map(d=>({id:d.id,...d.data()}));}return data;});
 const config=all.settings.find(s=>s.id==='config')||{},legacy=config.legacyParticipantIds||[],issues=[];
 if(!legacy.length)issues.push({kind:'missing-legacy-participants',detail:'Define la base histórica antes de activar el nuevo flujo'});
 const rows=expenseRows(all.movements,all.bills,all.billPayments,legacy),totals={};
 for(const row of rows){try{const key=C.cycle(row.date,config.cycleStartDay||1);totals[key]=(totals[key]||0)+C.cents(row.amount);}catch(e){issues.push({kind:'invalid-expense',date:row.date,error:e.message});}}
 for(const c of all.closedCycles){const actual=(totals[c.cycleKey||c.id]||0)/100;if(C.cents(c.total)!==C.cents(actual))issues.push({kind:'closed-cycle-mismatch',cycle:c.id,savedTotal:c.total,recomputedTotal:actual});}
 for(const item of all.items){if(!Number.isFinite(Number(item.currentQty))||Number(item.currentQty)<0)issues.push({kind:'invalid-stock',itemId:item.id});}
 for(const m of all.movements){if(m.itemId&&!all.items.some(i=>i.id===m.itemId))issues.push({kind:'missing-item-reference',movementId:m.id,itemId:m.itemId});}
 for(const m of all.movements){if(m.debtFronted&&!m.purchaseId)issues.push({kind:'legacy-unlinked-advance',movementId:m.id,detail:'Conciliar explícitamente deudas de origen antes de editar o anular'});if(m.splits?.length&&m.splits.reduce((s,p)=>s+C.cents(p.amount),0)!==C.cents(m.total))issues.push({kind:'split-total-mismatch',movementId:m.id});}
 for(const p of all.billPayments){if(p.scheduleUnverified)issues.push({kind:'unverified-bill-schedule',paymentId:p.id});}
 let balance=null;try{balance=C.balances(rows,all.members,all.settlements.filter(s=>!s.voided));if(balance.unassigned)issues.push({kind:'unassigned-expenses',amount:balance.unassigned});}catch(e){issues.push({kind:'invalid-ledger',error:e.message});}
 const report={counts:Object.fromEntries(Object.entries(all).map(([k,v])=>[k,v.length])),issues,balance};console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module)audit(services().db).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports=audit;
