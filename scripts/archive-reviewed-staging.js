/* Narrow, reviewed staging archive. Dry-run by default. Never production. */
const fs=require('node:fs');
const {archiveReviewedStaging,validateStaging}=require('./rehearse-test-archive');
function parseArgs(args){
 const result={file:args[0],apply:false,projectId:null,confirmation:null};
 if(!result.file||result.file.startsWith('--'))throw Error('Indica el archivo de respaldo');
 for(let i=1;i<args.length;i++){
  const arg=args[i];
  if(arg==='--apply'&&!result.apply)result.apply=true;
  else if(arg==='--project'&&!result.projectId&&args[i+1]&&!args[i+1].startsWith('--'))result.projectId=args[++i];
  else if(arg==='--confirm'&&!result.confirmation&&/^[a-f0-9]{64}$/.test(args[i+1]||''))result.confirmation=args[++i];
  else throw Error('Argumentos inválidos o repetidos');
 }
 if(result.projectId!=='casa-al-dia-staging'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Selecciona explícitamente staging, sin FIRESTORE_EMULATOR_HOST');
 if(result.apply&&!result.confirmation)throw Error('--apply requiere --confirm con la huella de la validación previa');
 if(!result.apply&&result.confirmation)throw Error('--confirm solo se usa junto con --apply');
 return result;
}
if(require.main===module){(async()=>{
 const options=parseArgs(process.argv.slice(2));
 const backup=JSON.parse(fs.readFileSync(options.file,'utf8'));
 validateStaging({projectId:options.projectId},backup,options.apply,options.confirmation);
 const db=require('./backup').createBackupDb({adc:true,projectId:options.projectId});
 try{
  const result=await archiveReviewedStaging(db,backup,options.apply,require('./codec'),options.confirmation);
  console.table(result.counts);console.log(JSON.stringify({...result,counts:undefined}));
 }finally{await db.terminate();}
})().catch(()=>{console.error('Verificación/archivado no completado. Comprueba proyecto, huella, sesión y coincidencia del respaldo. Si solicitaste --apply, verifica el estado antes de repetir: la escritura pudo completarse antes de fallar la comprobación posterior.');process.exitCode=1;});}
module.exports={parseArgs};
