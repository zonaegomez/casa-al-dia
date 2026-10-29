const fs=require('node:fs');
const {encode}=require('./codec');
const COLLECTIONS=['access','settings','members','purchases','items','movements','bills','billPayments','billReceipts','reminders','closedCycles','settlements','debts','operations','privateLoans','invitations'];
function argumentError(message){const e=Error(message);e.code='BACKUP_ARGUMENTS';return e;}
function parseArgs(args){
 let path,adc=false,projectId;
 for(let i=0;i<args.length;i++){
  const value=args[i];
  if(value==='--adc'){if(adc)throw argumentError('No repitas --adc');adc=true;}
  else if(value==='--project'){if(projectId||!args[i+1]||args[i+1].startsWith('--'))throw argumentError('Indica un solo --project con el ID del proyecto');projectId=args[++i];}
  else if(value.startsWith('--')||path)throw argumentError('Uso: node scripts/backup.js archivo-nuevo.json [--adc --project ID]');
  else path=value;
 }
 if(!path)throw argumentError('Indica una ruta de salida nueva, fuera del repositorio');
 if(adc&&!projectId)throw argumentError('--adc requiere --project para elegir explícitamente el origen');
 if(projectId&&!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))throw argumentError('ID de proyecto inválido');
 return {path,adc,projectId};
}
function createBackupDb(options,deps){
 if(!options.adc)return (deps?.services||require('../server/firebase').services)().db;
 if(!options.projectId)throw argumentError('--adc requiere --project');
 const {initializeApp,applicationDefault}=deps||require('firebase-admin/app');
 const getFirestore=deps?.getFirestore||require('firebase-admin/firestore').getFirestore;
 const app=initializeApp({credential:applicationDefault(),projectId:options.projectId},'casa-readonly-backup');
 return getFirestore(app);
}
async function backup(db,path,options={}){
 if(options.projectId&&db.projectId!==options.projectId){const e=Error('El proyecto autenticado no coincide con --project; no se leyó ningún dato');e.code='BACKUP_PROJECT';throw e;}
 const data=await db.runTransaction(async tx=>{
  const collections={};for(const name of COLLECTIONS){const snap=await tx.get(db.collection(name));collections[name]=snap.docs.map(d=>({id:d.id,data:d.data()}));}
  return {schemaVersion:2,kind:'firestore-full-backup',projectId:db.projectId,createdAt:new Date().toISOString(),collections};
 },{readOnly:true});
 fs.writeFileSync(path,JSON.stringify(encode(data),null,2),{flag:'wx',mode:0o600});console.log('Respaldo creado: '+path);
 return {projectId:data.projectId,collections:Object.fromEntries(Object.entries(data.collections).map(([name,docs])=>[name,docs.length]))};
}
if(require.main===module){(async()=>{const options=parseArgs(process.argv.slice(2));await backup(createBackupDb(options),options.path,options);})().catch(e=>{console.error(['BACKUP_ARGUMENTS','BACKUP_PROJECT'].includes(e.code)?e.message:'No se creó el respaldo. Revisa permisos, sesión, proyecto y ruta. Código: '+String(e.code||'sin-codigo'));process.exitCode=1;});}
module.exports={backup,COLLECTIONS,parseArgs,createBackupDb};
