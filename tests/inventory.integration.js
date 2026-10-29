// Synthetic inventory fixtures only; no household identities or real financial data.
const {test,before,after}=require('node:test');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');const fs=require('node:fs');let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-casa-al-dia',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'access/user'),{enabled:true,role:'member'});await setDoc(doc(db,'settings/config'),{cycleStartDay:1,currency:'MXN',revision:0,legacyParticipantIds:['a','b']});});});
after(async()=>{if(env)await env.cleanup();});
const dbFor=()=>env.authenticatedContext('user',{firebase:{sign_in_provider:'password'}}).firestore();
test('inventario rápido con reglas reales: consumo cero gasto, deshacer y estados sin mover el libro',async()=>{
 const sdk=dbFor(),{runTransaction}=require('firebase/firestore'),create=require('../store'),C=require('../core'),factory=require('../inventory-service'),assert=require('node:assert/strict');
 const db={doc:path=>doc(sdk,path),collection:name=>({doc:id=>doc(sdk,name+'/'+id)}),runTransaction:fn=>runTransaction(sdk,tx=>fn({get:async r=>{const s=await tx.get(r);return {exists:s.exists(),data:()=>s.data()};},set:(r,v)=>tx.set(r,v),delete:r=>tx.delete(r)}))};
 const members=[{id:'a',name:'A'},{id:'b',name:'B'}];let n=0;const store=create({state:{members},core:C,db:()=>db,actor:()=>'user',ready:()=>true,newId:()=>`inventory-${++n}`}),service=factory({store,C,members:()=>members});
 const exactId=await store.add('items',{name:'Leche',currentQty:9,minQty:3,unit:'pza',category:'despensa'});const simpleId=await store.add('items',{name:'Café',currentQty:0,minQty:0,trackingMode:'simple',stockStatus:'hay',category:'despensa'});
 const action=await service.consume({itemId:exactId,memberId:'a',qty:1,date:'2026-10-27'},{opId:'quick-use'});assert.equal((await getDoc(doc(sdk,'items/'+exactId))).data().currentQty,8);assert.equal((await getDoc(doc(sdk,'movements/quick-use'))).data().total,0);
 await service.undo(action,{opId:'undo-use'});assert.equal((await getDoc(doc(sdk,'items/'+exactId))).data().currentQty,9);assert.equal((await getDoc(doc(sdk,'movements/quick-use'))).data().voided,true);
 const revision=(await getDoc(doc(sdk,'settings/config'))).data().revision;
 const status=await service.setStatus(simpleId,'comprar',{opId:'out'});assert.equal((await getDoc(doc(sdk,'items/'+simpleId))).data().shoppingFlag,true);assert.equal((await getDoc(doc(sdk,'settings/config'))).data().revision,revision);await service.undo(status,{opId:'undo-status'});assert.equal((await getDoc(doc(sdk,'items/'+simpleId))).data().stockStatus,'hay');
});
