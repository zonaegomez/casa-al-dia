/* Dry-run by default. Run only after taking a full backup and stopping client writes. */
const {services}=require('../server/firebase');const C=require('../core');
async function migrate(db,apply=false){
 const configRef=db.doc('settings/config'),cfgSnap=await configRef.get(),cfg=cfgSnap.exists?cfgSnap.data():{};
 const memberSnap=await db.collection('members').get();
 const known=memberSnap.docs.map(d=>({id:d.id,...d.data()}));
 const supplied=process.env.LEGACY_PARTICIPANTS?JSON.parse(process.env.LEGACY_PARTICIPANTS):null;
 const ids=cfg.legacyParticipantIds||supplied;
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>!known.some(m=>m.id===id)))throw Error('Define LEGACY_PARTICIPANTS como arreglo JSON de IDs reales. Es una base explícita; no reconstruye quién participó históricamente.');
 const bills=await db.collection('bills').get();const plan=[];
 for(const doc of bills.docs){const history=doc.data().history||[];if(history.length>400)throw Error('Servicio '+doc.id+' supera 400 pagos; necesita migración por lotes específica');if(history.length)plan.push({billId:doc.id,payments:history.length});}
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',legacyParticipantIds:ids,bills:plan},null,2));
 if(!apply)return;
 await db.runTransaction(async tx=>{const s=await tx.get(configRef),v=s.exists?s.data():{};if(v.legacyParticipantIds&&JSON.stringify(v.legacyParticipantIds)!==JSON.stringify(ids))throw Error('La base histórica cambió');tx.set(configRef,{...v,cycleStartDay:v.cycleStartDay||1,currency:v.currency||'MXN',schemaVersion:2,legacyParticipantIds:ids,revision:Number(v.revision||0)+1});});
 for(const {billId} of plan){
  await db.runTransaction(async tx=>{
   const ref=db.doc('bills/'+billId),snap=await tx.get(ref),config=await tx.get(configRef);const history=snap.data().history||[];
   const docs=[];
   for(let i=0;i<history.length;i++){
    const paymentRef=db.doc('billPayments/legacy-'+billId+'-'+i),existing=await tx.get(paymentRef);
    if(existing.exists)throw Error('Existe un destino de migración mientras el origen conserva historial; requiere revisión: '+paymentRef.path);
    const p=history[i];C.date(p.paidAt);C.number(p.amount,'Pago',true);docs.push([paymentRef,{...p,billId,participantIds:p.participantIds||ids,migratedFrom:'bills/'+billId+'/history/'+i}]);
   }
   for(const [r,p]of docs)tx.set(r,p);
   tx.update(ref,{history:[]});tx.update(configRef,{revision:Number(config.data().revision||0)+1});
   tx.set(db.doc('operations/migrate-bill-'+billId),{kind:'migrate-bill',actorUid:'maintenance',createdAt:new Date().toISOString(),paymentCount:history.length,paths:[ref.path]});
  });
 }
 console.log('Migración terminada. Ejecuta otro dry-run: bills debe quedar vacío.');
}
if(require.main===module)migrate(services().db,process.argv.includes('--apply')).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports=migrate;
