const {test,before,after,beforeEach}=require('node:test');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,writeBatch}=require('firebase/firestore');const fs=require('node:fs');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-casa-al-dia',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync('firestore.rules','utf8')}});});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();await setDoc(doc(db,'access/user'),{enabled:true,role:'member',memberId:'a'});await setDoc(doc(db,'access/admin'),{enabled:true,role:'admin'});
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
 await assertFails(store.set('members','a',{name:'A',active:false},false));
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


async function loanFixture(){await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const [uid,memberId]of [['user','a'],['peer','b'],['admin','c']]){await setDoc(doc(db,'access/'+uid),{enabled:true,role:uid==='admin'?'admin':'member',memberId});await setDoc(doc(db,'members/'+memberId),{name:memberId});}await setDoc(doc(db,'privateLoans/private'),{participantUids:['user','peer'],lenderUid:'user',borrowerUid:'peer',lenderId:'a',borrowerId:'b',title:'Personal',amountCents:50000,status:'active',createdBy:'user',version:1,payments:[],events:[{id:'created',action:'create'}]});});}
test('préstamo privado: solo participantes leen; tercero y admin de casa no pueden',async()=>{await loanFixture();for(const uid of ['user','peer'])await assertSucceeds(getDoc(doc(dbFor(uid),'privateLoans/private')));for(const uid of ['admin','stranger'])await assertFails(getDoc(doc(dbFor(uid),'privateLoans/private')));await assertFails(getDoc(doc(dbFor('user','anonymous'),'privateLoans/private')));});
test('consulta privada requiere filtro del UID autenticado y no admite listar toda la colección',async()=>{await loanFixture();const {collection,query,where,getDocs}=require('firebase/firestore');await assertSucceeds(getDocs(query(collection(dbFor(),'privateLoans'),where('participantUids','array-contains','user'))));await assertFails(getDocs(collection(dbFor(),'privateLoans')));await assertFails(getDocs(query(collection(dbFor('admin'),'privateLoans'),where('participantUids','array-contains','user'))));});
test('SDK no permite crear, alterar, borrar préstamos ni falsificar vinculación',async()=>{await loanFixture();const {deleteDoc}=require('firebase/firestore');for(const uid of ['user','peer','admin']){await assertFails(setDoc(doc(dbFor(uid),'privateLoans/forged'),{participantUids:[uid]}));await assertFails(setDoc(doc(dbFor(uid),'privateLoans/private'),{status:'settled'},{merge:true}));await assertFails(deleteDoc(doc(dbFor(uid),'privateLoans/private')));await assertFails(setDoc(doc(dbFor(uid),'access/'+uid),{memberId:'a'},{merge:true}));}});
test('cuenta revocada pierde lectura de préstamo privado',async()=>{await loanFixture();await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'access/user'),{enabled:false,memberId:'a'}));await assertFails(getDoc(doc(dbFor(),'privateLoans/private')));});
test('API de préstamos con Firestore real confirma, registra abono una vez y no altera libro compartido',async()=>{
 await loanFixture();const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),assert=require('node:assert/strict'),{operate}=require('../server/loans');const app=initializeApp({projectId:'demo-casa-al-dia'},'loans-real'),db=getFirestore(app);
 try{
 const input={action:'create',loanId:'new-private',operationId:'new-private',otherMemberId:'b',direction:'lend',amount:500,title:'Personal'};
 await operate(db,'user',input);await operate(db,'user',input);await assert.rejects(operate(db,'admin',{action:'accept',loanId:'new-private',operationId:'third',expectedVersion:1}),/no disponible/);
 await operate(db,'peer',{action:'accept',loanId:'new-private',operationId:'accept',expectedVersion:1});
 const abono={action:'payment',loanId:'new-private',operationId:'payment',expectedVersion:2,amount:200};await operate(db,'peer',abono);await operate(db,'peer',abono);
 assert.equal((await db.doc('privateLoans/new-private').get()).data().payments.length,1);
 await operate(db,'user',{action:'confirm-payment',loanId:'new-private',operationId:'confirm',paymentId:'payment',expectedVersion:3});
 assert.equal(require('../server/loans').outstanding((await db.doc('privateLoans/new-private').get()).data()),30000);
 assert.equal((await db.doc('settings/config').get()).data().revision,0);assert.equal((await db.collection('operations').get()).size,0);
 const result=await require('firebase/firestore').getDocs(require('firebase/firestore').query(require('firebase/firestore').collection(dbFor('peer'),'privateLoans'),require('firebase/firestore').where('participantUids','array-contains','peer')));assert.equal(result.size,2);
 }finally{await app.delete();}
});

test('ajuste acordado no permite anulación unilateral ni expone el préstamo a otro integrante',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();await setDoc(doc(db,'settlements/adjustment-test'),{fromId:'a',toId:'b',fromName:'A',toName:'B',amount:10,date:'2026-10-19',kind:'agreed-adjustment',updatedBy:'admin'});
  await setDoc(doc(db,'privateLoans/secret'),{participantUids:['admin','other'],title:'Privado',amountCents:50000});
 });
 for(const uid of ['user','admin']){
  const db=dbFor(uid);await assertSucceeds(getDoc(doc(db,'settlements/adjustment-test')));
  const batch=writeBatch(db);batch.update(doc(db,'settings/config'),{revision:1,updatedBy:uid});batch.update(doc(db,'settlements/adjustment-test'),{voided:true,updatedBy:uid});await assertFails(batch.commit());
 }
 await assertFails(getDoc(doc(dbFor('user'),'privateLoans/secret')));
});
test('compensación completa en Firestore: dos usuarios aceptan y se actualizan ambos saldos una vez',async()=>{
 const assert=require('node:assert/strict'),{initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const app=initializeApp({projectId:'demo-casa-al-dia'},'offset-test'),db=getFirestore(app);
 try{
  await db.doc('access/user').set({enabled:true,memberId:'a',role:'member'});await db.doc('access/other').set({enabled:true,memberId:'b',role:'member'});
  await db.doc('members/a').set({name:'Persona A'});await db.doc('members/b').set({name:'Persona B'});
  await db.doc('movements/shared').set({type:'compra',total:20,memberId:'b',date:'2026-10-19',participantIds:['a','b']});
  const {operate,outstanding}=require('../server/loans');
  await operate(db,'user',{action:'create',loanId:'private-fixture',operationId:'create-fixture',otherMemberId:'b',direction:'lend',amount:500,title:'Concepto privado'});
  await operate(db,'other',{action:'accept',loanId:'private-fixture',operationId:'accept-fixture',expectedVersion:1});
  await operate(db,'user',{action:'propose-offset',loanId:'private-fixture',operationId:'proposal-fixture',expectedVersion:2,amount:10});
  assert.equal((await db.collection('settlements').get()).size,0);
  const acceptance={action:'confirm-offset',loanId:'private-fixture',operationId:'offset-fixture',paymentId:'proposal-fixture',expectedVersion:3};
  await operate(db,'other',acceptance);await operate(db,'other',acceptance);
  assert.equal(outstanding((await db.doc('privateLoans/private-fixture').get()).data()),49000);
  const adjustments=await db.collection('settlements').get();assert.equal(adjustments.size,1);assert.equal(adjustments.docs[0].data().amount,10);
  assert.equal(adjustments.docs[0].data().kind,'agreed-adjustment');assert.equal((await db.doc('settings/config').get()).data().revision,1);
 }finally{await app.delete();}
});

test('cada integrante modifica solo su perfil; el administrador gestiona altas y estado',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'members/a'),{name:'A',color:'#6258E8',active:true});await setDoc(doc(db,'members/b'),{name:'B',color:'#16856B',active:true});});
 function update(uid,id,data){const db=dbFor(uid),b=writeBatch(db);b.update(doc(db,'settings/config'),{revision:1,updatedBy:uid});b.update(doc(db,'members/'+id),{...data,updatedBy:uid});return b.commit();}
 await assertFails(update('user','b',{name:'Otro nombre'}));
 await assertFails(update('admin','b',{name:'Otro nombre'}));
 await assertFails(update('user','a',{active:false}));
 await assertFails(update('user','a',{role:'admin'}));
 await assertSucceeds(update('user','a',{name:'Mi nombre',color:'#16856B'}));
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'settings/config'),{revision:0},{merge:true}));
 await assertSucceeds(update('admin','b',{active:false}));
});

test('invitaciones: correo verificado, vínculo único, cancelación y vencimiento sin tocar gastos anteriores',async()=>{
 const assert=require('node:assert/strict'),{initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),I=require('../server/invitations'),C=require('../core');
 const app=initializeApp({projectId:'demo-casa-al-dia'},'invitation-test'),db=getFirestore(app),now=Date.now();
 try{
  await db.doc('members/a').set({name:'A',active:true});await db.doc('members/b').set({name:'B',active:true});await db.doc('movements/old').set({type:'compra',total:300,date:'2026-10-20',participantIds:['a','b'],memberId:'a'});
  const previous=(await db.doc('movements/old').get()).data(),config=(await db.doc('settings/config').get()).data();
  await assert.rejects(I.createInvitation(db,'user',{name:'Invitada',email:'new@example.test'},now),/administrador/);
  const inv=await I.createInvitation(db,'admin',{name:'Invitada',email:' NEW@example.test '},now),pending=(await db.doc('members/'+inv.memberId).get()).data();
  assert.equal(pending.active,false);assert.equal(pending.invitationPending,true);
  await assert.rejects(I.createInvitation(db,'admin',{name:'Otro perfil',email:'new@example.test',memberId:'b'},now),/Cancela/);assert.ok(!(await I.listInvitations(db,'admin')).invitations[0].secretHash);
  const stored=(await db.doc('invitations/'+inv.id).get()).data();assert.ok(!JSON.stringify(stored).includes(inv.token.split('.')[1]));
  const identity={uid:'new-user',email:'new@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};
  await assert.rejects(I.acceptInvitation(db,{...identity,email_verified:false},inv.token,now),/Verifica/);
  await assert.rejects(I.acceptInvitation(db,{...identity,email:'other@example.test'},inv.token,now),/correo/);
  await assert.rejects(I.acceptInvitation(db,identity,inv.token,now+8*86400000),/vencida/);
  await assertFails(getDoc(doc(dbFor('new-user'),'bills/luz')));
  await assertFails(getDoc(doc(dbFor('admin'),'invitations/'+inv.id)));
  await I.acceptInvitation(db,identity,inv.token,now);await I.acceptInvitation(db,identity,inv.token,now);
  assert.equal((await db.doc('access/new-user').get()).data().role,'member');
  assert.equal((await db.doc('access/new-user').get()).data().memberId,inv.memberId);
  assert.equal((await db.doc('members/'+inv.memberId).get()).data().active,true);
  await assertSucceeds(getDoc(doc(dbFor('new-user'),'bills/luz')));
  assert.deepEqual((await db.doc('movements/old').get()).data(),previous);assert.deepEqual((await db.doc('settings/config').get()).data().legacyParticipantIds,config.legacyParticipantIds);
  assert.equal(C.balances([{...previous,amount:previous.total}],[{id:'a'},{id:'b'},{id:inv.memberId}],[]).balances.find(b=>b.member.id===inv.memberId).fairShare,0);
  await assert.rejects(I.createInvitation(db,'admin',{name:'Otra',email:'second@example.test',memberId:inv.memberId},now),/acceso vinculado/);
  const cancel=await I.createInvitation(db,'admin',{name:'Cancelada',email:'cancel@example.test'},now);await I.revokeInvitation(db,'admin',cancel.id);await assert.rejects(I.acceptInvitation(db,{...identity,uid:'cancel-user',email:'cancel@example.test'},cancel.token,now),/cancelada/);
  assert.equal((await db.doc('members/'+cancel.memberId).get()).data().active,false);
  const first=await I.createInvitation(db,'admin',{name:'Rotación',email:'rotate@example.test'},now),second=await I.createInvitation(db,'admin',{name:'Rotación',email:'rotate@example.test'},now+1000);
  assert.equal(first.memberId,second.memberId);await assert.rejects(I.invitationInfo(db,first.token,now+1001),/inválida/);assert.equal((await I.invitationInfo(db,second.token,now+1001)).status,'pending');
  const same=await I.createInvitation(db,'admin',{name:'Un perfil',email:'one@example.test'},now);
  await assert.rejects(I.createInvitation(db,'admin',{name:'Un perfil',email:'two@example.test',memberId:same.memberId},now),/otra invitación/);
  const race=await I.createInvitation(db,'admin',{name:'Concurrente',email:'race@example.test'},now),r=await Promise.allSettled([I.acceptInvitation(db,{...identity,uid:'race-one',email:'race@example.test'},race.token,now),I.acceptInvitation(db,{...identity,uid:'race-two',email:'race@example.test'},race.token,now)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 }finally{await app.delete();}
});

test('foto de perfil se guarda en servidor solo para el titular; cliente no puede inyectarla',async()=>{
 const assert=require('node:assert/strict'),{initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{saveProfile}=require('../server/profile');const app=initializeApp({projectId:'demo-casa-al-dia'},'profile-server'),db=getFirestore(app);
 try{await db.doc('members/a').set({name:'A',color:'#6258E8'});await db.doc('members/b').set({name:'B',color:'#16856B'});await assert.rejects(saveProfile(db,'user',{memberId:'b',name:'Otro',color:'#16856B',photoData:null}),/propio/);await saveProfile(db,'user',{memberId:'a',name:'Mi nombre',color:'#16856B',photoData:null});assert.equal((await db.doc('members/a').get()).data().name,'Mi nombre');const sdk=dbFor(),b=writeBatch(sdk);b.update(doc(sdk,'settings/config'),{revision:2,updatedBy:'user'});b.update(doc(sdk,'members/a'),{photoData:'https://example.test/tracker',updatedBy:'user'});await assertFails(b.commit());}finally{await app.delete();}
});
