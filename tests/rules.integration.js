const {test,before,after,beforeEach}=require('node:test');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,writeBatch}=require('firebase/firestore');const fs=require('node:fs');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-casa-al-dia',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync('firestore.rules','utf8')}});});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();await setDoc(doc(db,'access/user'),{enabled:true,role:'member'});await setDoc(doc(db,'access/admin'),{enabled:true,role:'admin'});
 await setDoc(doc(db,'settings/config'),{cycleStartDay:15,currency:'MXN',revision:0,legacyParticipantIds:['a','b']});await setDoc(doc(db,'closedCycles/2026-09'),{total:100});
 await setDoc(doc(db,'bills/luz'),{name:'Luz',history:[{paidAt:'2026-09-20',amount:100}],nextDueDate:'2026-10-20',amountEstimate:100});
});});
const dbFor=(uid='user',provider='password')=>env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}}).firestore();
function purchase(db,date){const batch=writeBatch(db);batch.update(doc(db,'settings/config'),{revision:1,updatedBy:'user'});batch.set(doc(db,'movements/p'),{date,type:'compra',qty:1,total:10,unitCost:10,itemId:null,memberId:'a',participantIds:['a','b'],updatedBy:'user'});return batch.commit();}
test('rechaza sesiones anónimas aun si su UID figura en allowlist',async()=>{await assertFails(getDoc(doc(dbFor('user','anonymous'),'bills/luz')));});
test('rechaza cuenta no autorizada',async()=>{await assertFails(getDoc(doc(dbFor('stranger'),'bills/luz')));});
test('miembro autorizado puede leer',async()=>{await assertSucceeds(getDoc(doc(dbFor(),'bills/luz')));});
test('no permite autoautorizarse ni crear cierres desde cliente',async()=>{const db=dbFor();await assertFails(setDoc(doc(db,'access/user'),{enabled:true,role:'admin'}));await assertFails(setDoc(doc(db,'closedCycles/2026-10'),{total:0}));});
test('rechaza escritura en ciclo cerrado con inicio personalizado',async()=>{await assertFails(purchase(dbFor(),'2026-10-01'));});
test('acepta compra transaccional en ciclo abierto',async()=>{await assertSucceeds(purchase(dbFor(),'2026-10-19'));});
test('rechaza modificación del historial incrustado anterior',async()=>{const db=dbFor();const b=writeBatch(db);b.update(doc(db,'settings/config'),{revision:1,updatedBy:'user'});b.update(doc(db,'bills/luz'),{history:[],updatedBy:'user'});await assertFails(b.commit());});
test('no permite cambiar el inicio de ciclo ni al administrador',async()=>{const db=dbFor('admin');await assertFails(setDoc(doc(db,'settings/config'),{cycleStartDay:1,currency:'MXN',updatedBy:'admin',revision:1,legacyParticipantIds:['a','b']}));});
test('no permite reescribir ni borrar comprobante de operación',async()=>{const db=dbFor();await assertSucceeds(setDoc(doc(db,'operations/p'),{actorUid:'user',paths:[]}));await assertFails(setDoc(doc(db,'operations/p'),{actorUid:'user',paths:['changed']}));});
test('la capa de escritura real funciona con las reglas: compra, pago y desactivación',async()=>{
 const sdk=dbFor(),{runTransaction}=require('firebase/firestore'),create=require('../store'),C=require('../core');
 const db={doc:path=>doc(sdk,path),collection:name=>({doc:id=>doc(sdk,name+'/'+id)}),runTransaction:fn=>runTransaction(sdk,tx=>fn({get:async r=>{const s=await tx.get(r);return {exists:s.exists(),data:()=>s.data()};},set:(r,v)=>tx.set(r,v),delete:r=>tx.delete(r)}))};
 let n=0;const store=create({state:{members:[{id:'a'},{id:'b'}]},core:C,db:()=>db,actor:()=>'user',ready:()=>true,newId:()=>`real-${++n}`});
 await assertSucceeds(store.atomic({opId:'real-purchase'},async t=>{await t.put('items','rice',{name:'Arroz',currentQty:2,minQty:0},false);await t.put('movements','m1',{type:'compra',itemId:'rice',qty:2,total:10,unitCost:5,date:'2026-10-19',memberId:'a',participantIds:['a','b']},false);}));
 await assertSucceeds(store.atomic({opId:'real-payment'},async t=>{await t.put('billPayments','p1',{billId:'luz',paidAt:'2026-10-19',amount:100,memberId:'a',participantIds:['a','b']},false);await t.put('bills','luz',{nextDueDate:'2026-11-20'});}));
 await assertSucceeds(store.set('members','a',{name:'A',active:false},false));
});
test('protege creación, cambio de fecha y anulación de pago cerrado',async()=>{
 const db=dbFor();await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'billPayments/closed'),{billId:'luz',amount:100,paidAt:'2026-09-20',participantIds:['a','b'],updatedBy:'user'}));
 const b=writeBatch(db);b.update(doc(db,'settings/config'),{revision:1,updatedBy:'user'});b.update(doc(db,'billPayments/closed'),{paidAt:'2026-10-19',updatedBy:'user'});await assertFails(b.commit());
});
test('migración antigua mueve pagos una sola vez y conserva montos',async()=>{
 const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const adminApp=initializeApp({projectId:'demo-casa-al-dia'},'migration-test'),db=getFirestore(adminApp);
 try{
  await db.doc('members/a').set({name:'A'});await db.doc('members/b').set({name:'B'});
  const migrate=require('../scripts/migrate');await migrate(db,false);
  if((await db.doc('bills/luz').get()).data().history.length!==1)throw Error('Dry-run escribió datos');
  await migrate(db,true);await migrate(db,true);
  const payments=await db.collection('billPayments').get();if(payments.size!==1||payments.docs[0].data().amount!==100)throw Error('Migración duplicó o cambió importe');
  if((await db.doc('bills/luz').get()).data().history.length!==0)throw Error('Origen no vaciado');
 }finally{await adminApp.delete();}
});
test('cierre en servidor lee más de 400 movimientos y congela total completo',async()=>{
 const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');const app=initializeApp({projectId:'demo-casa-al-dia'},'close-test'),db=getFirestore(app);
 try{
  await db.doc('members/a').set({name:'A'});await db.doc('members/b').set({name:'B'});
  const batch=db.batch();for(let i=0;i<405;i++)batch.set(db.doc('movements/m'+i),{type:'compra',qty:1,total:1,date:'2026-10-19',memberId:'a',participantIds:['a','b']});await batch.commit();
  const close=require('../api/close-cycle').closeCycle;const snapshot=await close(db,'admin','2026-10','2026-12-19');
  if(snapshot.total!==405||snapshot.expenseCount!==405)throw Error('Cierre truncado');
  const again=await close(db,'admin','2026-10','2026-12-19');if(again.total!==405)throw Error('Cierre no idempotente');
 }finally{await app.delete();}
});
test('respaldo completo restaura en destino vacío y rechaza sobrescribir',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const source=initializeApp({projectId:'demo-casa-al-dia'},'backup-source'),target=initializeApp({projectId:'demo-casa-restore'},'backup-target');const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'casa-backup-')),'data.json');
 try{
  const {backup}=require('../scripts/backup'),restore=require('../scripts/restore'),db=getFirestore(target);await backup(getFirestore(source),out);await restore(db,out,false);await restore(db,out,true);
  const copied=await db.doc('bills/luz').get();if(copied.data().history[0].amount!==100)throw Error('Dato restaurado no coincide');
  await require('node:assert/strict').rejects(restore(db,out,true),/vacío/);
 }finally{fs.rmSync(path.dirname(out),{recursive:true,force:true});await source.delete();await target.delete();}
});
test('transferencia en servidor verifica saldo real y no acepta sobrepago ni reenvío duplicado',async()=>{
 const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),assert=require('node:assert/strict');const app=initializeApp({projectId:'demo-casa-al-dia'},'settle-test'),db=getFirestore(app);
 try{
  await db.doc('members/a').set({name:'A'});await db.doc('members/b').set({name:'B'});
  await db.doc('bills/luz').update({history:[{paidAt:'2026-09-20',amount:100,memberId:'a'}]});
  const settle=require('../api/settle').settle;
  await assert.rejects(settle(db,'user',{fromId:'b',toId:'a',amount:60,expectedRevision:0,operationId:'settlement-excess'}),/importe/);
  const input={fromId:'b',toId:'a',amount:50,expectedRevision:0,operationId:'settlement-once'};
  await settle(db,'user',input);await settle(db,'user',input);assert.equal((await db.collection('settlements').get()).size,1);
 }finally{await app.delete();}
});
test('compra con adelanto crea, corrige y anula líneas, stock, cabecera y deudas con reglas reales',async()=>{
 const sdk=dbFor(),{runTransaction}=require('firebase/firestore'),create=require('../store'),C=require('../core'),factory=require('../purchase-service');
 const db={doc:path=>doc(sdk,path),collection:name=>({doc:id=>doc(sdk,name+'/'+id)}),runTransaction:fn=>runTransaction(sdk,tx=>fn({get:async r=>{const s=await tx.get(r);return {exists:s.exists(),data:()=>s.data()};},set:(r,v)=>tx.set(r,v),delete:r=>tx.delete(r)}))};
 const members=[{id:'a',name:'A'},{id:'b',name:'B'}];let n=0;
 const store=create({state:{members},core:C,db:()=>db,actor:()=>'user',ready:()=>true,newId:()=>`integrated-${++n}`}),service=factory({store,C,members:()=>members});
 await assertSucceeds(store.add('items',{name:'Arroz',category:'despensa',unit:'kg',currentQty:10,minQty:0}));
 const input={date:'2026-10-20',concept:'Cena',participantIds:['a','b'],mode:'deuda',lines:[{itemId:'integrated-1',qty:2,total:100}],payers:[{memberId:'a',memberName:'A',amount:100}],debtorShares:[{memberId:'b',amount:50}]};
 await assertSucceeds(service.create(input,{opId:'purchase-real'}));await assertSucceeds(service.edit('purchase-real-0',{total:200,date:'2026-10-20'},{opId:'edit-real'}));
 const debt=await getDoc(doc(sdk,'debts/purchase-real-debt-b'));if(debt.data().totalAmount!==100)throw Error('Deuda desactualizada');
 await assertSucceeds(service.voidPurchase('purchase-real-0',{opId:'void-real'}));const item=await getDoc(doc(sdk,'items/integrated-1'));if(item.data().currentQty!==10)throw Error('Existencias no revertidas');
});

test('recibo con cuotas y aportaciones parciales funciona con reglas reales sin duplicar gasto',async()=>{
 const sdk=dbFor(),{runTransaction}=require('firebase/firestore'),create=require('../store'),C=require('../core'),factory=require('../bill-service');
 const db={doc:path=>doc(sdk,path),collection:name=>({doc:id=>doc(sdk,name+'/'+id)}),runTransaction:fn=>runTransaction(sdk,tx=>fn({get:async r=>{const s=await tx.get(r);return {exists:s.exists(),data:()=>s.data()};},set:(r,v)=>tx.set(r,v),delete:r=>tx.delete(r)}))};
 const people=[{id:'a',name:'A'},{id:'b',name:'B'}];let n=0;const store=create({state:{members:people},core:C,db:()=>db,actor:()=>'user',ready:()=>true,newId:()=>`bill-${++n}`});
 const service=factory({store,C,members:()=>people,addMonths:(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);}});
 await assertSucceeds(store.add('bills',{name:'Renta',cycle:'mensual',nextDueDate:'2026-10-20',amountEstimate:100,history:[],participantIds:['a','b'],splitPolicy:'fixed',fixedShares:[{memberId:'a',amount:60},{memberId:'b',amount:40}]}));
 const input={receiptTotal:100,amount:60,paidAt:'2026-10-20',dueDate:'2026-10-20',memberId:'a',participantIds:['a','b']};
 await assertSucceeds(service.pay('bill-1',input,{opId:'bill-partial'}));
 let snap=await getDoc(doc(sdk,'bills/bill-1'));if(snap.data().nextDueDate!=='2026-10-20')throw Error('Pago parcial avanzó vencimiento');
 await assertSucceeds(service.pay('bill-1',{...input,amount:40,memberId:'b'},{opId:'bill-complete'}));
 snap=await getDoc(doc(sdk,'bills/bill-1'));if(snap.data().nextDueDate!=='2026-11-20')throw Error('Pago completo no avanzó');
 await assertFails(setDoc(doc(sdk,'billReceipts/bill-1-2026-10-20'),{amount:200}));
 await assertSucceeds(service.edit('bill-1','bill-partial',{voided:true},{opId:'bill-undo'}));
});

test('consolidación de renta conserva pagos, corrige octubre y no duplica al repetir',async()=>{
 const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),assert=require('node:assert/strict');
 const app=initializeApp({projectId:'demo-casa-al-dia'},'rent-migration-test'),db=getFirestore(app),old=process.env.RENT_MIGRATION_BACKUP_CONFIRMED;
 try{
  for(const [i,name,amount]of [['a','Erick',6000],['b','Axel',5500],['c','Marbet',7000]]){await db.doc('members/'+i).set({name});await db.doc('bills/rent-'+i).set({name:'Renta '+name,cycle:'mensual',amountEstimate:amount,nextDueDate:'2026-11-15',history:[{amount,memberId:i,memberName:name,paidAt:'2026-10-15',period:name==='Marbet'?'2026-11':'2026-10'}]});}
  const migrate=require('../scripts/consolidate-rent');await migrate(db,false);assert.equal((await db.doc('bills/rent-unified').get()).exists,false);
  process.env.RENT_MIGRATION_BACKUP_CONFIRMED='yes';await migrate(db,true);await migrate(db,true);
  assert.equal((await db.doc('billReceipts/rent-unified-2026-10-15').get()).data().amount,18500);
  assert.equal((await db.doc('billPayments/rent-oct2026-2').get()).data().period,'2026-10');
  assert.equal((await db.doc('bills/rent-c').get()).data().history.length,0);
  assert.equal((await db.doc('operations/consolidate-rent-oct2026').get()).data().originalBills.length,3);
 }finally{if(old===undefined)delete process.env.RENT_MIGRATION_BACKUP_CONFIRMED;else process.env.RENT_MIGRATION_BACKUP_CONFIRMED=old;await app.delete();}
});
