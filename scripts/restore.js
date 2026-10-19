/* Restore into an EMPTY test project first. Never merges or deletes existing data. */
const fs=require('node:fs');const {services}=require('../server/firebase');const {COLLECTIONS}=require('./backup');
async function restore(db,file,apply=false){
 const data=require('./codec').decode(JSON.parse(fs.readFileSync(file,'utf8')));
 if(data.kind!=='firestore-full-backup'||data.schemaVersion!==2||!data.collections)throw Error('Formato de respaldo incompatible');
 const existing=await db.listCollections();
 for(const ref of existing){if(!(await ref.limit(1).get()).empty)throw Error('El destino debe estar vacío. No se sobrescribirá información existente.');}
 let count=0;
 for(const [coll,docs]of Object.entries(data.collections)){
  if(!COLLECTIONS.includes(coll)||!Array.isArray(docs))throw Error('Colección inválida');
  for(const d of docs){if(typeof d.id!=='string'||d.id.includes('/')||!d.data)throw Error('Documento inválido');count++;}
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',target:db.projectId,documents:count}));
 if(!apply)return;
 for(const [coll,docs]of Object.entries(data.collections)){
  for(let i=0;i<docs.length;i+=400){const batch=db.batch();for(const d of docs.slice(i,i+400))batch.create(db.doc(coll+'/'+d.id),d.data);await batch.commit();}
 }
 console.log('Restauración terminada; verifica cantidades y saldos antes de usar el destino.');
}
if(require.main===module){const file=process.argv[2];if(!file)throw Error('Indica el archivo de respaldo');restore(services().db,file,process.argv.includes('--apply')).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports=restore;
