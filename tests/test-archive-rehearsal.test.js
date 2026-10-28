const test=require('node:test');const assert=require('node:assert/strict');
const {buildPlan,rehearse,ALL}=require('../scripts/rehearse-test-archive');
const fixture=()=>({kind:'firestore-full-backup',schemaVersion:2,projectId:'fixture-source',collections:Object.fromEntries(ALL.map(c=>[c,[]]))});
const codec={encode:v=>v,decode:v=>v};
function fakeDb(backup){
 const rows=new Map(Object.entries(backup.collections).flatMap(([c,docs])=>docs.map(d=>[c+'/'+d.id,structuredClone(d.data)])));
 let writes=0;
 const query=c=>({docs:[...rows].filter(([p])=>p.split('/')[0]===c).map(([p,v])=>({id:p.split('/')[1],data:()=>structuredClone(v)}))});
 const db={projectId:'demo-casa-respaldo',doc:path=>({path}),collection:name=>({name,get:async()=>query(name)}),runTransaction:async fn=>{
  const pending=[];await fn({get:async ref=>ref.name?query(ref.name):{exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))},update:(ref,patch)=>pending.push(()=>rows.set(ref.path,{...rows.get(ref.path),...patch})),create:(ref,value)=>pending.push(()=>rows.set(ref.path,value))});
  pending.forEach(f=>{f();writes++;});
 }};return {db,rows,writes:()=>writes};
}
test('rejects incomplete snapshots and linked real-plan funds',()=>{
 const b=fixture();delete b.collections.privateLoans;assert.throws(()=>buildPlan(b));
 const linked=fixture();linked.collections.settings.push({id:'config',data:{financePlan:{contributions:[{receiptId:'receipt'}]}}});assert.throws(()=>buildPlan(linked),/vinculadas/);
 const debt=fixture();debt.collections.debts.push({id:'d',data:{}});assert.throws(()=>buildPlan(debt),/clasificación/);
});
test('fails before any DB calls outside the explicit emulator',async()=>{
 const old=process.env.FIRESTORE_EMULATOR_HOST;delete process.env.FIRESTORE_EMULATOR_HOST;
 try{await assert.rejects(rehearse({projectId:'real-project'},fixture(),true,codec),/Solo/);}finally{if(old!==undefined)process.env.FIRESTORE_EMULATOR_HOST=old;}
});
test('dry-run writes nothing; atomic rehearsal preserves protected data and originals, and repeats safely',async()=>{
 const old=process.env.FIRESTORE_EMULATOR_HOST;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';
 try{
  const b=fixture();b.collections.movements.push({id:'m',data:{total:10,voided:false}});b.collections.closedCycles.push({id:'2020-01',data:{total:10}});b.collections.settings.push({id:'config',data:{financePlan:{payments:[{amount:1}]}}});b.collections.privateLoans.push({id:'private',data:{amount:1}});
  const f=fakeDb(b);await rehearse(f.db,b,false,codec);assert.equal(f.writes(),0);
  const r=await rehearse(f.db,b,true,codec);assert.equal(r.documents,2);assert.equal(f.writes(),3);
  assert.deepEqual(f.rows.get('settings/config'),b.collections.settings[0].data);assert.deepEqual(f.rows.get('privateLoans/private'),{amount:1});
  assert.equal(f.rows.get('movements/m').voided,true);assert.equal(f.rows.get('closedCycles/2020-01').archived,true);
  const marker=[...f.rows].find(([p])=>p.startsWith('operations/'))[1];assert.deepEqual(marker.originals.find(d=>d.id==='m').data,{total:10,voided:false});
  assert.equal((await rehearse(f.db,b,true,codec)).repeated,true);assert.equal(f.writes(),3);
 }finally{if(old===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=old;}
});
test('new or edited records prevent all writes',async()=>{
 const old=process.env.FIRESTORE_EMULATOR_HOST;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';
 try{const b=fixture(),f=fakeDb(b);f.rows.set('movements/new',{total:12});await assert.rejects(rehearse(f.db,b,true,codec),/Cantidad distinta/);assert.equal(f.writes(),0);}
 finally{if(old===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=old;}
});
test('reviewed staging scope requires exact counts, project, preserved plan and explicit matching digest',async()=>{
 const {archiveReviewedStaging,backupDigest,validateStaging}=require('../scripts/rehearse-test-archive');
 const {parseArgs}=require('../scripts/archive-reviewed-staging');
 const old=process.env.FIRESTORE_EMULATOR_HOST;delete process.env.FIRESTORE_EMULATOR_HOST;
 try{
  assert.throws(()=>parseArgs(['file.json','--project','production']));
  assert.throws(()=>parseArgs(['file.json','--project','casa-al-dia-staging','--apply']));
  const b=fixture();b.projectId='casa-al-dia-staging';
  const counts={purchases:5,items:3,movements:50,bills:3,billReceipts:4,billPayments:8,settlements:1,closedCycles:1,access:3,settings:1,members:3,operations:46,privateLoans:1};
  for(const [name,count]of Object.entries(counts))b.collections[name]=Array.from({length:count},(_,i)=>({id:'fixture-'+i,data:{value:i}}));
  b.collections.settings=[{id:'config',data:{financePlan:{payments:[{amount:1}]}}}];
  const f=fakeDb(b);f.db.projectId='casa-al-dia-staging';
  const summary=await archiveReviewedStaging(f.db,b,false,codec);assert.equal(summary.documents,75);assert.equal(f.writes(),0);
  await assert.rejects(archiveReviewedStaging(f.db,b,true,codec,'0'.repeat(64)),/huella/);assert.equal(f.writes(),0);
  assert.throws(()=>validateStaging({projectId:'production'},b,false),/staging/);
  process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';assert.throws(()=>validateStaging(f.db,b,false),/emulador/);delete process.env.FIRESTORE_EMULATOR_HOST;
  const result=await archiveReviewedStaging(f.db,b,true,codec,backupDigest(b));assert.equal(result.mode,'staging-applied');assert.equal(f.writes(),76);
  assert.deepEqual(f.rows.get('settings/config'),b.collections.settings[0].data);
  const before=f.writes();await archiveReviewedStaging(f.db,b,true,codec,backupDigest(b));assert.equal(f.writes(),before);
  const changed=structuredClone(b);changed.collections.movements.pop();assert.throws(()=>validateStaging(f.db,changed,false),/alcance/);
 }finally{if(old===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=old;}
});
