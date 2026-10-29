/* Emulator-only rehearsal. Never connects to a real Firebase project. */
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const SELECTED=['purchases','items','movements','bills','billReceipts','billPayments','settlements','closedCycles'];
const ALL=['access','settings','members',...SELECTED,'reminders','debts','operations','privateLoans'];
function buildPlan(backup){
 if(backup.kind!=='firestore-full-backup'||backup.schemaVersion!==2||!backup.projectId)throw Error('Respaldo incompatible');
 for(const name of ALL){
  const docs=backup.collections?.[name];
  if(!Array.isArray(docs)||new Set(docs.map(d=>d.id)).size!==docs.length||docs.some(d=>!d.id||d.id.includes('/')||!d.data||typeof d.data!=='object'))throw Error('Colección inválida: '+name);
 }
 if(Object.keys(backup.collections).some(name=>!ALL.includes(name)))throw Error('Colección sin clasificar');
 if(backup.collections.debts.length||backup.collections.reminders.length)throw Error('Hay deudas o recordatorios que requieren clasificación separada');
 const plan=backup.collections.settings.find(d=>d.id==='config')?.data.financePlan;
 if((plan?.contributions||[]).some(c=>c.receiptId))throw Error('El plan tiene aportaciones vinculadas a servicios; concilia antes de archivar');
 const targets=SELECTED.flatMap(collection=>backup.collections[collection].map(d=>({collection,...d})));
 if(targets.length>400)throw Error('Demasiados registros para este ensayo');
 if(Buffer.byteLength(JSON.stringify(targets))>650000)throw Error('El historial del ensayo excede el tamaño permitido');
 return {targets,counts:Object.fromEntries(SELECTED.map(c=>[c,backup.collections[c].length]))};
}
function requireEmulator(db){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||db.projectId!=='demo-casa-respaldo')throw Error('Solo se permite el emulador local demo-casa-respaldo en 127.0.0.1:8088');
}
function archived(data,archiveId){return {...data,archived:true,voided:true,testArchiveId:archiveId};}
async function rehearse(db,backup,apply,codec){
 requireEmulator(db);
 return archiveSnapshot(db,backup,apply,codec,'emulator');
}
function backupDigest(backup){return createHash('sha256').update(JSON.stringify(backup)).digest('hex');}
function validateStaging(db,backup,apply,confirmation){
 if(process.env.FIRESTORE_EMULATOR_HOST||db.projectId!=='casa-al-dia-staging'||backup.projectId!==db.projectId)throw Error('Solo se permite el proyecto staging explícito, sin emulador');
 const reviewed={purchases:5,items:3,movements:50,bills:3,billReceipts:4,billPayments:8,settlements:1,closedCycles:1};
 const {counts}=buildPlan(backup);
 if(!isDeepStrictEqual(counts,reviewed)||Object.values(backup.collections).reduce((n,docs)=>n+docs.length,0)!==129)throw Error('El respaldo no coincide con el alcance revisado de 75 registros');
 if(!backup.collections.settings.find(d=>d.id==='config')?.data.financePlan)throw Error('Falta el plan de pagos que debe conservarse');
 if(apply&&confirmation!==backupDigest(backup))throw Error('La aplicación requiere confirmar la huella del respaldo revisado');
}
async function archiveReviewedStaging(db,backup,apply,codec,confirmation){
 validateStaging(db,backup,apply,confirmation);
 return archiveSnapshot(db,backup,apply,codec,'staging');
}
async function archiveSnapshot(db,backup,apply,codec,target){
 const {targets,counts}=buildPlan(backup);
 const archiveId='test-archive-'+backupDigest(backup).slice(0,24);
 const kind=target==='emulator'?'test-archive-rehearsal':'reviewed-test-data-archive';
 const archiveRef=db.doc('operations/'+archiveId);
 let repeated=false;
 await db.runTransaction(async tx=>{
  const marker=await tx.get(archiveRef);repeated=marker.exists;
  for(const name of ALL){
   const snap=await tx.get(db.collection(name));
   const actual=new Map(snap.docs.filter(d=>!(name==='operations'&&d.id===archiveId)).map(d=>[d.id,codec.encode(d.data())]));
   if(actual.size!==backup.collections[name].length)throw Error('Cantidad distinta del respaldo: '+name);
   for(const d of backup.collections[name]){
    const expected=repeated&&SELECTED.includes(name)?archived(d.data,archiveId):d.data;
    if(!isDeepStrictEqual(actual.get(d.id),expected))throw Error('Contenido distinto del respaldo: '+name);
   }
  }
  if(repeated){
   const saved=codec.encode(marker.data());
   if(saved.kind!==kind||saved.sourceProject!==backup.projectId||!isDeepStrictEqual(saved.originals,targets))throw Error('Historial del archivado inconsistente');
  }
  if(!apply||repeated)return;
  for(const d of targets)tx.update(db.doc(d.collection+'/'+d.id),{archived:true,voided:true,testArchiveId:archiveId});
  tx.create(archiveRef,codec.decode({kind,sourceProject:backup.projectId,sourceCreatedAt:backup.createdAt||null,originals:targets}));
 });
 if(apply){
  // Verify every document, including protected data, after the atomic operation.
  for(const name of ALL){
   const snap=await db.collection(name).get();
   const actual=new Map(snap.docs.filter(d=>!(name==='operations'&&d.id===archiveId)).map(d=>[d.id,codec.encode(d.data())]));
   if(actual.size!==backup.collections[name].length)throw Error('Verificación de cantidad falló: '+name);
   for(const d of backup.collections[name])if(!isDeepStrictEqual(actual.get(d.id),SELECTED.includes(name)?archived(d.data,archiveId):d.data))throw Error('Verificación de contenido falló: '+name);
  }
 }
 return {mode:apply?target+'-applied':'dry-run',target:db.projectId,backupSha256:backupDigest(backup),repeated,counts,documents:targets.length,protectedUnchanged:true};
}
if(require.main===module){(async()=>{
 const args=process.argv.slice(2),file=args[0];
 if(!file||args.slice(1).some(a=>a!=='--apply')||args.filter(a=>a==='--apply').length>1)throw Error('Uso: node scripts/rehearse-test-archive.js archivo.json [--apply]');
 // Guard before SDK initialization; ADC and service-account credentials are never used.
 requireEmulator({projectId:'demo-casa-respaldo'});
 const backup=JSON.parse(fs.readFileSync(file,'utf8'));
 const {Firestore}=require('@google-cloud/firestore');
 const db=new Firestore({projectId:'demo-casa-respaldo'});
 try{const result=await rehearse(db,backup,args.includes('--apply'),require('./codec'));console.table(result.counts);console.log(JSON.stringify({...result,counts:undefined}));}
 finally{await db.terminate();}
})().catch(()=>{console.error('Ensayo no completado. Comprueba emulador, respaldo y coincidencia de registros. No uses este script contra Firebase real.');process.exitCode=1;});}
module.exports={buildPlan,rehearse,archiveReviewedStaging,validateStaging,backupDigest,SELECTED,ALL};
