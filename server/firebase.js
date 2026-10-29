const {initializeApp,getApps,cert}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
function services(){
  if(!getApps().length){
    const value=process.env.FIREBASE_SERVICE_ACCOUNT;
    if(!value)throw Error('Servidor pendiente de configurar');
    const credentials=JSON.parse(value);
    initializeApp({credential:cert(credentials)});
  }
  return {auth:getAuth(),db:getFirestore()};
}
async function authorize(req,admin=false){
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
  if(!bearer){const e=Error('Inicia sesión');e.status=401;throw e;}
  const {auth,db}=services();let token;
  try{token=await auth.verifyIdToken(bearer[1],true);}catch{const e=Error('Sesión inválida o vencida');e.status=401;throw e;}
  const permission=await db.doc('access/'+token.uid).get();
  if(token.firebase?.sign_in_provider==='anonymous'||!permission.exists||permission.data().enabled!==true||(admin&&permission.data().role!=='admin')){const e=Error('Cuenta sin autorización para esta acción');e.status=403;throw e;}
  return {uid:token.uid,db};
}
function body(req){
  try{return typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{const e=Error('JSON inválido');e.status=400;throw e;}
}
function fail(res,e){return res.status(e.status||500).json({error:e.status&&e.status<500?e.message:'No se pudo completar la operación. Revisa la configuración del servidor o vuelve a intentar.'});}
module.exports={services,authorize,body,fail};
