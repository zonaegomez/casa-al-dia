const fs=require('node:fs');const {services}=require('../server/firebase');
const {encode}=require('./codec');
const COLLECTIONS=['access','settings','members','purchases','items','movements','bills','billPayments','reminders','closedCycles','settlements','debts','operations'];
async function backup(db,path){
 const data=await db.runTransaction(async tx=>{
  const collections={};for(const name of COLLECTIONS){const snap=await tx.get(db.collection(name));collections[name]=snap.docs.map(d=>({id:d.id,data:d.data()}));}
  return {schemaVersion:2,kind:'firestore-full-backup',projectId:db.projectId,createdAt:new Date().toISOString(),collections};
 });
 fs.writeFileSync(path,JSON.stringify(encode(data),null,2),{flag:'wx',mode:0o600});console.log('Respaldo creado: '+path);
}
if(require.main===module){const path=process.argv[2];if(!path)throw Error('Indica una ruta de salida nueva');backup(services().db,path).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={backup,COLLECTIONS};
