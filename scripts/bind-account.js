// Run only with the service account for the intended staging/production project.
// Does not create users, authorize accounts, or permit identity reassignment.
const {services}=require('../server/firebase');
async function bind(db,auth,uid,memberId,apply=false){
 if(!uid||!memberId||uid.includes('/')||memberId.includes('/'))throw Error('Indica UID y memberId exactos');
 const user=await auth.getUser(uid);if(user.disabled||!user.providerData.some(p=>p.providerId==='password'))throw Error('La cuenta debe estar habilitada y usar correo/contraseña');
 return db.runTransaction(async tx=>{
  const ref=db.doc('access/'+uid),permission=await tx.get(ref),member=await tx.get(db.doc('members/'+memberId)),accounts=await tx.get(db.collection('access').where('memberId','==',memberId));
  if(!permission.exists||permission.data().enabled!==true)throw Error('Autoriza primero la cuenta verificada en access');
  if(!member.exists||member.data().active===false)throw Error('Integrante inexistente o inactivo');
  if(permission.data().memberId&&permission.data().memberId!==memberId)throw Error('No se reasigna una cuenta vinculada. Requiere revisión de identidad e historial.');
  if(accounts.docs.some(d=>d.id!==uid&&d.data().enabled===true))throw Error('Ese integrante ya tiene otra cuenta habilitada');
  const result={mode:apply?'apply':'dry-run',projectId:db.projectId,uid,memberId,memberName:member.data().name};
  if(apply)tx.set(ref,{...permission.data(),memberId});return result;
 });
}
if(require.main===module){const {db,auth}=services();bind(db,auth,process.argv[2],process.argv[3],process.argv.includes('--apply')).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports=bind;
