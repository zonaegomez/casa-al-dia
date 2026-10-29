const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {backup,COLLECTIONS,parseArgs,createBackupDb}=require('../scripts/backup');
test('ADC backup requires explicit project and does not silently consume service-account credentials',()=>{
 assert.throws(()=>parseArgs(['backup.json','--adc']),/requiere --project/);
 assert.throws(()=>parseArgs(['backup.json','--adc','--project','wrong project']),/inválido/);
 assert.throws(()=>parseArgs(['backup.json','--project','project-a','--project','project-b']),/un solo/);
 const options=parseArgs(['backup.json','--adc','--project','project-a']);let initialized,called=0;
 const db=createBackupDb(options,{applicationDefault(){called++;return {kind:'test-adc'};},initializeApp(config,name){initialized={config,name};return config;},getFirestore:app=>({projectId:app.projectId}),services(){throw Error('Unexpected legacy credential use');}});
 assert.equal(called,1);assert.equal(db.projectId,'project-a');assert.equal(initialized.config.projectId,'project-a');
 const legacy={db:{projectId:'legacy-project'}};assert.equal(createBackupDb(parseArgs(['backup.json']),{services:()=>legacy}),legacy.db);
});
test('mismatched project stops before any database read or file creation',async()=>{
 let reads=0;const target=path.join(os.tmpdir(),'unused-casa-backup-'+Date.now()+'.json');
 await assert.rejects(()=>backup({projectId:'project-b',runTransaction(){reads++;}},target,{projectId:'project-a'}),/no coincide/);
 assert.equal(reads,0);assert.equal(fs.existsSync(target),false);
});
test('backup uses read-only transaction, includes every collection and refuses overwrite',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'casa-backup-test-')),file=path.join(dir,'snapshot.json');let transactionOptions,reads=0;
 const db={projectId:'project-a',collection:name=>({name}),async runTransaction(fn,options){transactionOptions=options;return fn({async get(ref){reads++;return {docs:[{id:'sample',data:()=>({kind:ref.name})}]};}});}};
 try{
  const result=await backup(db,file,{projectId:'project-a'});assert.deepEqual(transactionOptions,{readOnly:true});assert.equal(reads,COLLECTIONS.length);
  const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.kind,'firestore-full-backup');assert.equal(data.collections.privateLoans.length,1);assert.equal(data.collections.settings.length,1);assert.equal(result.collections.operations,1);
  assert.equal(fs.statSync(file).mode&0o777,0o600);const bytes=fs.readFileSync(file,'utf8');await assert.rejects(()=>backup(db,file),{code:'EEXIST'});assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
