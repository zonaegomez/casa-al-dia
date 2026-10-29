// Fictional receipt data only.
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core'),createStore=require('../store'),createPurchases=require('../purchase-service'),fake=require('./fake-db');
function setup(seed={}){
 const members=[{id:'a',name:'Persona A'},{id:'b',name:'Persona B'}],db=fake({'settings/config':{cycleStartDay:1,revision:0,legacyParticipantIds:['a','b']},'items/rice':{name:'Arroz QA',category:'despensa',unit:'pza',currentQty:10,minQty:0},...seed});
 let n=0;const store=createStore({state:{members},core:C,db:()=>db,actor:()=>'qa',ready:()=>true,newId:()=>`generated-${++n}`});
 return {db,p:createPurchases({store,C,members:()=>members})};
}
const receipt={date:'2026-10-20',store:'Super QA',participantIds:['a','b'],payers:[{memberId:'a',memberName:'Persona A',amount:120}],lines:[{itemId:'rice',qty:2,total:80},{itemName:'Producto QA',category:'despensa',qty:1,total:40}]};
const meta=opId=>({opId,kind:'purchase-ticket'});
async function duplicateError(p,input=receipt,id='second'){let error;try{await p.create(input,meta(id));}catch(e){error=e;}assert.equal(error?.code,'DUPLICATE_TICKET');return error;}
test('bloquea probable duplicado con otra operación o pagador antes de cambiar stock o gasto',async()=>{
 const {db,p}=setup();await p.create(receipt,meta('first'));const before=db.snapshot();
 const e=await duplicateError(p,{...receipt,store:'Súper-QA',participantIds:['b'],payers:[{memberId:'b',memberName:'Persona B',amount:120}]});
 assert.equal(e.matches.length,1);assert.equal(e.matches[0].id,'first');assert.equal(e.matches[0].total,120);assert.equal(e.matches[0].productCount,2);assert.deepEqual(db.snapshot(),before);
 await duplicateError(p);assert.deepEqual(db.snapshot(),before);
});
test('solo confirmación explícita permite duplicar e informa origen; reintento no vuelve a sumar',async()=>{
 const {db,p}=setup();await p.create(receipt,meta('first'));const e=await duplicateError(p);
 await p.create({...receipt,allowDuplicate:true,duplicateToken:e.duplicateToken},meta('second'));
 assert.equal(db.read('items/rice').currentQty,14);assert.equal(db.read('purchases/second').total,120);assert.deepEqual(db.read('purchases/second').duplicateOf,['first']);assert.equal(db.read('purchases/second').duplicateConfirmed,true);
 assert.equal(db.read('operations/second').actorUid,'qa');const before=db.snapshot();
 await p.create(receipt,meta('second'));assert.deepEqual(db.snapshot(),before);
});
test('confirmación vieja no autoriza un formulario modificado con el mismo total',async()=>{
 const {db,p}=setup();await p.create(receipt,meta('first'));const e=await duplicateError(p);const before=db.snapshot();
 const input={...receipt,lines:[{itemId:'rice',qty:3,total:80},receipt.lines[1]],allowDuplicate:true,duplicateToken:e.duplicateToken};
 const next=await duplicateError(p,input);assert.notEqual(next.duplicateToken,e.duplicateToken);assert.deepEqual(db.snapshot(),before);
});
test('fecha, tienda o total distintos no se bloquean; tienda vacía sigue advirtiendo',async()=>{
 const {p}=setup();await p.create(receipt,meta('first'));
 await duplicateError(p,{...receipt,store:''});
 await p.create({...receipt,date:'2026-10-21'},meta('new-date'));
 await p.create({...receipt,store:'Otra tienda'},meta('new-store'));
 await p.create({...receipt,lines:[{itemId:'rice',qty:2,total:90},receipt.lines[1]],payers:[{memberId:'a',amount:130}]},meta('new-total'));
});
test('compras anuladas no bloquean, pero otra copia activa sí se detecta',async()=>{
 const {db,p}=setup();await p.create(receipt,meta('first'));await p.voidPurchase('first-0',{opId:'void-first'});
 await p.create(receipt,meta('replacement'));assert.equal(db.read('items/rice').currentQty,12);const e=await duplicateError(p,receipt,'third');assert.deepEqual(e.matches.map(m=>m.id),['replacement']);
});
test('detecta tickets históricos agrupados sin cabecera',async()=>{
 const {db,p}=setup({'movements/old-0':{type:'compra',date:'2026-10-20',store:'Super QA',total:80,ticketGroupId:'old-ticket'},'movements/old-1':{type:'compra',date:'2026-10-20',store:'Super QA',total:40,ticketGroupId:'old-ticket'}});
 const before=db.snapshot(),e=await duplicateError(p);assert.equal(e.matches[0].id,'old-ticket');assert.equal(e.matches[0].total,120);assert.deepEqual(db.snapshot(),before);
});
test('dos dispositivos concurrentes no crean ambos tickets sin advertencia',async()=>{
 const {db,p}=setup();const results=await Promise.allSettled([p.create(receipt,meta('one')),p.create(receipt,meta('two'))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(db.read('items/rice').currentQty,12);
 const failed=results.findIndex(x=>x.status==='rejected');assert.ok(['LEDGER_CHANGED','DUPLICATE_TICKET'].includes(results[failed].reason.code));
 await duplicateError(p,receipt,failed===0?'one':'two');
 assert.equal(Object.keys(db.snapshot()).filter(p=>p.startsWith('purchases/')).length,1);
});
test('si no puede comprobar el servidor, no guarda usando una copia local',async()=>{
 const {db,p}=setup(),before=db.snapshot();const original=db.collection;
 db.collection=name=>{const coll=original(name);return {...coll,where(){return {get:async()=>{throw Error('Server unavailable');}};}};};
 await assert.rejects(p.create(receipt,meta('offline')),/Server unavailable/);assert.deepEqual(db.snapshot(),before);
});
