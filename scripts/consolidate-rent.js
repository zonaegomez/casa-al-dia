/* Run before generic migrate. Dry-run is default. Never delete source history without a verified backup. */
const C=require('../core'),{services}=require('../server/firebase');
const SPEC=[['Renta Erick',6000],['Renta Axel',5500],['Renta Marbet',7000]];
async function consolidateRent(db,apply=false){
 const result=await db.runTransaction(async tx=>{
  const op=db.doc('operations/consolidate-rent-oct2026'),done=await tx.get(op);if(done.exists)return {alreadyApplied:true};
  const bills=await tx.get(db.collection('bills')),members=await tx.get(db.collection('members')),cfgRef=db.doc('settings/config'),cfg=await tx.get(cfgRef);
  const sources=[],shares=[],payments=[];
  for(const [name,amount]of SPEC){
   const matches=bills.docs.filter(d=>d.data().name===name&&!d.data().archived);if(matches.length!==1)throw Error('Debe existir exactamente un servicio activo '+name);
   const d=matches[0],b=d.data();if(b.amountEstimate!==amount||b.cycle!=='mensual'||b.nextDueDate!=='2026-11-15'||b.history?.length!==1||b.paymentIds?.length)throw Error('El origen '+name+' cambió respecto al plan; concilia antes de migrar');
   const p=b.history[0];if(p.amount!==amount||!members.docs.some(m=>m.id===p.memberId))throw Error('Pago o integrante no coincide con '+name);
   C.date(p.paidAt);if(!['2026-10','2026-11'].includes(p.period)||!p.paidAt.startsWith('2026-10-'))throw Error('Periodo o fecha no contemplados en '+name);
   sources.push({id:d.id,data:b});shares.push({memberId:p.memberId,amount});payments.push({...p,period:'2026-10',dueDate:'2026-10-15',billId:'rent-unified',receiptId:'rent-unified-2026-10-15',participantIds:[p.memberId],migratedFrom:'bills/'+d.id+'/history/0'});
  }
  if(new Set(shares.map(p=>p.memberId)).size!==3)throw Error('Las cuotas deben pertenecer a tres integrantes distintos');
  const target=db.doc('bills/rent-unified'),existing=await tx.get(target);if(existing.exists)throw Error('Ya existe destino sin comprobante; requiere conciliación');
  const receiptRef=db.doc('billReceipts/rent-unified-2026-10-15');if((await tx.get(receiptRef)).exists)throw Error('Ya existe recibo destino');
  const paymentRefs=[];for(let i=0;i<payments.length;i++){const ref=db.doc('billPayments/rent-oct2026-'+i);if((await tx.get(ref)).exists)throw Error('Ya existe pago destino');paymentRefs.push(ref);}
  const plan={total:18500,dueDate:'2026-10-15',nextDueDate:'2026-11-15',shares,sources:sources.map(s=>s.id),periodCorrection:'Renta Marbet: 2026-11 → 2026-10'};
  if(!apply)return plan;
  if(process.env.RENT_MIGRATION_BACKUP_CONFIRMED!=='yes')throw Error('Confirma respaldo completo y restauración de prueba con RENT_MIGRATION_BACKUP_CONFIRMED=yes');
  const ids=shares.map(p=>p.memberId);
  tx.set(target,{name:'Renta',subtype:'Renta',cycle:'mensual',amountType:'fixed',splitPolicy:'fixed',amountEstimate:18500,participantIds:ids,fixedShares:shares,nextDueDate:'2026-11-15',scheduleAnchor:'2026-10-15',history:[],paymentIds:paymentRefs.map(r=>r.id)});
  tx.set(receiptRef,{billId:'rent-unified',name:'Renta',amount:18500,dueDate:'2026-10-15',period:'2026-10',participantIds:ids,beneficiaryShares:shares});
  paymentRefs.forEach((ref,i)=>tx.set(ref,payments[i]));
  sources.forEach(s=>tx.update(db.doc('bills/'+s.id),{history:[],archived:true,migratedTo:'rent-unified'}));
  tx.set(cfgRef,{...(cfg.exists?cfg.data():{}),revision:Number(cfg.data()?.revision||0)+1});
  tx.set(op,{kind:'consolidate-rent',actorUid:'maintenance',createdAt:new Date().toISOString(),plan,originalBills:sources,paths:[target.path,receiptRef.path,...paymentRefs.map(r=>r.path)]});return plan;
 });console.log(JSON.stringify({mode:apply?'apply':'dry-run',...result},null,2));return result;
}
if(require.main===module)consolidateRent(services().db,process.argv.includes('--apply')).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports=consolidateRent;
