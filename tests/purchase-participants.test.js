// Synthetic household fixtures only.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core'),createStore=require('../store'),createPurchase=require('../purchase-service'),fake=require('./fake-db');
function setup(seed={}){
 const members=[{id:'a',name:'Persona A'},{id:'b',name:'Persona B'},{id:'c',name:'Persona C'},{id:'d',name:'Persona D',active:false}];
 const db=fake({'settings/config':{cycleStartDay:1,revision:0,legacyParticipantIds:['a','b','c']},'items/stock':{name:'Arroz QA',category:'despensa',currentQty:10,minQty:0,unit:'pza'},...seed});
 const store=createStore({state:{members},core:C,db:()=>db,actor:()=>'qa',ready:()=>true,newId:()=>'qa-id'});
 return {db,p:createPurchase({store,C,members:()=>members}),members};
}
const ticket={date:'2026-10-20',participantIds:['a','b','c'],mode:'normal',payers:[{memberId:'c',memberName:'Persona C',amount:900}],lines:[{itemId:'stock',qty:2,total:600},{itemId:null,itemName:'Personal QA',category:'despensa',qty:1,total:180},{itemId:null,itemName:'Pareja QA',category:'despensa',qty:1,total:120}]};
const parts=header=>Object.fromEntries(header.beneficiaryShares.map(p=>[p.memberId,p.amount]));
test('edita personal y pareja en un mismo ticket sin duplicar gasto, pagador ni stock',async()=>{
 const {db,p,members}=setup();await p.create(ticket,{opId:'ticket'});
 await p.edit('ticket-1',{participantIds:['a']},{opId:'personal'});
 await p.edit('ticket-2',{participantIds:['b','c']},{opId:'pareja'});
 const header=db.read('purchases/ticket');assert.deepEqual(parts(header),{a:380,b:260,c:260});assert.equal(header.total,900);
 assert.deepEqual(header.payers,ticket.payers);assert.equal(db.read('items/stock').currentQty,12);
 assert.deepEqual(db.read('movements/ticket-0').participantIds,['a','b','c']);assert.deepEqual(db.read('movements/ticket-1').participantIds,['a']);assert.deepEqual(db.read('movements/ticket-2').participantIds,['b','c']);
 const rows=header.lineIds.map(id=>{const l=db.read('movements/'+id);assert.equal(l.beneficiaryShares.reduce((s,x)=>s+C.cents(x.amount),0),C.cents(l.total));return {amount:l.total,payers:l.splits,participantIds:l.participantIds,beneficiaryShares:l.beneficiaryShares};});
 const balances=C.balances(rows,members,[]).balances;assert.equal(balances.find(x=>x.member.id==='a').balance,-380);assert.equal(balances.find(x=>x.member.id==='b').balance,-260);assert.equal(balances.find(x=>x.member.id==='c').balance,640);
 assert.equal(Object.keys(db.snapshot()).filter(x=>x.startsWith('movements/')).length,3);assert.equal(Object.keys(db.snapshot()).filter(x=>x.startsWith('purchases/')).length,1);
 const before=db.snapshot();await p.edit('ticket-2',{participantIds:['b','c']},{opId:'pareja'});assert.deepEqual(db.snapshot(),before);
 await p.edit('ticket-1',{participantIds:['a','b','c']},{opId:'volver'});assert.deepEqual(parts(db.read('purchases/ticket')),{a:260,b:320,c:320});assert.equal(db.read('items/stock').currentQty,12);
});
test('rechaza reparto vacío, duplicado, desconocido o integrante inactivo nuevo sin cambios parciales',async()=>{
 const {db,p}=setup();await p.create(ticket,{opId:'ticket'});const before=db.snapshot();
 for(const ids of [[],['a','a'],['unknown'],['d']]){await assert.rejects(p.edit('ticket-1',{participantIds:ids},{opId:'bad-'+JSON.stringify(ids)}),/persona válida/);assert.deepEqual(db.snapshot(),before);}
});
test('cabecera actualiza integrantes cuando una línea cambia a otra persona',async()=>{
 const {db,p}=setup();await p.create({...ticket,participantIds:['a'],lines:[{itemId:null,itemName:'QA',qty:1,total:900}]},{opId:'ticket'});
 await p.edit('ticket-0',{participantIds:['c']},{opId:'change'});assert.deepEqual(db.read('purchases/ticket').participantIds,['c']);assert.deepEqual(parts(db.read('purchases/ticket')),{c:900});
});
test('compra antigua recalcula cuotas guardadas y conserva participantes históricos inactivos',async()=>{
 const {db,p}=setup({'movements/old':{type:'compra',date:'2026-10-20',qty:1,total:20,itemName:'QA',memberId:'c',participantIds:['d'],beneficiaryShares:[{memberId:'d',amount:20}]}});
 await p.edit('old',{total:20,participantIds:['d']},{opId:'preserve'});assert.deepEqual(db.read('movements/old').beneficiaryShares,[{memberId:'d',amount:20}]);
 await p.edit('old',{total:20,participantIds:['a','b']},{opId:'split'});assert.deepEqual(db.read('movements/old').beneficiaryShares,[{memberId:'a',amount:10},{memberId:'b',amount:10}]);assert.deepEqual(db.read('movements/old').participantIds,['a','b']);
});
test('adelanto con deuda vinculada bloquea cambios de reparto',async()=>{
 const {db,p}=setup();await p.create({...ticket,mode:'deuda',debtorShares:[{memberId:'a',amount:300},{memberId:'b',amount:300}]},{opId:'ticket'});const before=db.snapshot();
 await assert.rejects(p.edit('ticket-1',{participantIds:['a']},{opId:'bad'}),/deudas vinculadas/);assert.deepEqual(db.snapshot(),before);
});
test('reparto nuevo conserva aportaciones de varios pagadores',async()=>{
 const {db,p}=setup(),payers=[{memberId:'a',memberName:'Persona A',amount:400},{memberId:'c',memberName:'Persona C',amount:500}];
 await p.create({...ticket,mode:'dividido',payers},{opId:'ticket'});await p.edit('ticket-1',{participantIds:['a']},{opId:'personal'});await p.edit('ticket-2',{participantIds:['b','c']},{opId:'pair'});
 assert.deepEqual(db.read('purchases/ticket').payers,payers);assert.deepEqual(parts(db.read('purchases/ticket')),{a:380,b:260,c:260});
 for(const payer of payers)assert.equal(db.read('purchases/ticket').lineIds.flatMap(id=>db.read('movements/'+id).splits).filter(x=>x.memberId===payer.memberId).reduce((sum,x)=>sum+C.cents(x.amount),0),C.cents(payer.amount));
});
test('ciclo cerrado rechaza corrección de reparto sin alterar ticket ni stock',async()=>{
 const {db,p}=setup();await p.create(ticket,{opId:'ticket'});
 await db.runTransaction(async tx=>{tx.set(db.doc('closedCycles/2026-10'),{closedAt:'2026-11-01'});});const before=db.snapshot();
 await assert.rejects(p.edit('ticket-1',{participantIds:['a']},{opId:'closed'}),/cerrado/);assert.deepEqual(db.snapshot(),before);
});
