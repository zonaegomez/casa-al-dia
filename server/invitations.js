const {randomBytes,randomUUID,createHash,timingSafeEqual}=require('node:crypto');
const DAY=86400000;
function error(message,status=400){const e=Error(message);e.status=status;throw e;}
function email(value){const s=String(value||'').trim().toLowerCase();if(s.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(s))error('Indica un correo válido');return s;}
function digest(s){return createHash('sha256').update(s).digest('hex');}
function parseToken(token){if(typeof token!=='string'||!/^invite-[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token))error('Invitación inválida o vencida',404);return token.split('.');}
function validInvitation(data,secret,now){const hash=digest(secret);if(!data||typeof data.secretHash!=='string'||data.secretHash.length!==hash.length||!timingSafeEqual(Buffer.from(hash),Buffer.from(data.secretHash))||data.expiresAt<=now||!['pending','accepted'].includes(data.status))error('Invitación inválida, cancelada o vencida',404);}
async function admin(tx,db,uid){const snap=await tx.get(db.doc('access/'+uid));if(!snap.exists||snap.data().enabled!==true||snap.data().role!=='admin')error('Solo el administrador invita integrantes',403);}
async function createInvitation(db,uid,input,now=Date.now()){
 const address=email(input.email),name=String(input.name||'').trim();if(!name||name.length>120)error('Indica el nombre del integrante (máximo 120 caracteres)');
 const requested=input.memberId||null;if(requested&&(!/^[A-Za-z0-9_-]{1,150}$/.test(requested)))error('Integrante inválido');
 const id='invite-'+digest(address),secret=randomBytes(32).toString('hex'),freshId='member-'+randomUUID();
 return db.runTransaction(async tx=>{
  await admin(tx,db,uid);
  const ref=db.doc('invitations/'+id),oldSnap=await tx.get(ref),old=oldSnap.exists?oldSnap.data():null;
  if(old?.status==='accepted')error('Ese correo ya aceptó una invitación. No se crea otro perfil.',409);
  const memberId=requested||old?.memberId||freshId,memberRef=db.doc('members/'+memberId),memberSnap=await tx.get(memberRef),member=memberSnap.exists?memberSnap.data():null;
  if(requested&&!member)error('Integrante no disponible',404);
  const owners=await tx.get(db.collection('access').where('memberId','==',memberId));
  if(owners.docs.length||member?.accountUid)error('Ese integrante ya tiene acceso vinculado',409);
  if(member?.invitationId&&member.invitationId!==id)error('Ese perfil ya tiene otra invitación; cancélala primero',409);
  const configRef=db.doc('settings/config'),snap=await tx.get(configRef),config=snap.exists?snap.data():{};
  const legacy=config.legacyParticipantIds||(await tx.get(db.collection('members'))).docs.filter(d=>d.data().active!==false).map(d=>d.id).sort();
  const data={email:address,name:member?.name||name,memberId,status:'pending',secretHash:digest(secret),expiresAt:now+7*DAY,createdAt:old?.createdAt||new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),createdBy:uid};
  tx.set(ref,data);
  tx.set(memberRef,{...(member||{name,color:'#6258E8',active:false}),invitationId:id,invitationPending:true,updatedBy:uid});
  tx.set(configRef,{...config,legacyParticipantIds:legacy,revision:Number(config.revision||0)+1,updatedBy:uid});
  return {id,memberId,email:address,name:data.name,expiresAt:data.expiresAt,token:id+'.'+secret};
 });
}
async function invitationInfo(db,token,now=Date.now()){
 const [id,secret]=parseToken(token),snap=await db.doc('invitations/'+id).get(),data=snap.exists?snap.data():null;validInvitation(data,secret,now);
 return {name:data.name,status:data.status,expiresAt:data.expiresAt};
}
async function acceptInvitation(db,identity,token,now=Date.now()){
 const [id,secret]=parseToken(token);if(!identity?.uid||identity.email_verified!==true||identity.firebase?.sign_in_provider==='anonymous')error('Verifica tu correo antes de aceptar la invitación',403);
 const address=email(identity.email);
 return db.runTransaction(async tx=>{
  const ref=db.doc('invitations/'+id),snap=await tx.get(ref),data=snap.exists?snap.data():null;validInvitation(data,secret,now);
  if(address!==data.email)error('Inicia sesión con el correo al que se dirigió la invitación',403);
  const accessRef=db.doc('access/'+identity.uid),accessSnap=await tx.get(accessRef),access=accessSnap.exists?accessSnap.data():null;
  if(data.status==='accepted'){if(data.acceptedBy===identity.uid&&access?.enabled===true&&access.memberId===data.memberId)return {memberId:data.memberId,accepted:true};error('Esta invitación ya se utilizó',409);}
  if(access)error('Esta cuenta ya tiene una vinculación. El administrador debe revisarla.',409);
  const memberRef=db.doc('members/'+data.memberId),memberSnap=await tx.get(memberRef),m=memberSnap.exists?memberSnap.data():null;
  if(!m||m.invitationId!==id||m.accountUid)error('El perfil ya no está disponible para esta invitación',409);
  const owners=await tx.get(db.collection('access').where('memberId','==',data.memberId));if(owners.docs.length)error('Este perfil ya tiene un acceso vinculado',409);
  const configRef=db.doc('settings/config'),configSnap=await tx.get(configRef),config=configSnap.exists?configSnap.data():{};
  tx.set(accessRef,{enabled:true,role:'member',memberId:data.memberId,createdAt:new Date(now).toISOString(),invitedBy:data.createdBy});
  tx.set(memberRef,{...m,active:true,invitationPending:false,accountUid:identity.uid,joinedAt:new Date(now).toISOString(),updatedBy:identity.uid});
  tx.set(ref,{...data,status:'accepted',acceptedBy:identity.uid,acceptedAt:new Date(now).toISOString()});
  tx.set(configRef,{...config,revision:Number(config.revision||0)+1,updatedBy:identity.uid});
  return {memberId:data.memberId,accepted:true};
 });
}
async function revokeInvitation(db,uid,id){if(typeof id!=='string'||!/^invite-[a-f0-9]{64}$/.test(id))error('Invitación inválida');return db.runTransaction(async tx=>{await admin(tx,db,uid);const ref=db.doc('invitations/'+id),snap=await tx.get(ref);if(!snap.exists)error('Invitación no disponible',404);const data=snap.data();if(data.status==='accepted')error('La invitación ya fue aceptada',409);const mr=db.doc('members/'+data.memberId),ms=await tx.get(mr),cr=db.doc('settings/config'),cs=await tx.get(cr),config=cs.exists?cs.data():{};tx.set(ref,{...data,status:'revoked',updatedBy:uid});if(ms.exists&&ms.data().invitationId===id){tx.set(mr,{...ms.data(),invitationPending:false,invitationId:null,updatedBy:uid});}tx.set(cr,{...config,revision:Number(config.revision||0)+1,updatedBy:uid});return {revoked:true};});}
async function listInvitations(db,uid){const permission=await db.doc('access/'+uid).get();if(!permission.exists||!permission.data().enabled||permission.data().role!=='admin')error('Solo el administrador consulta invitaciones',403);const snap=await db.collection('invitations').get();return {invitations:snap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.status==='pending').map(d=>({id:d.id,email:d.email,name:d.name,memberId:d.memberId,expiresAt:d.expiresAt})).sort((a,b)=>b.expiresAt-a.expiresAt)};}
module.exports={normalizeEmail:email,createInvitation,invitationInfo,acceptInvitation,revokeInvitation,listInvitations};
