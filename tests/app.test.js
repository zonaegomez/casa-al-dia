const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
test('guardar ticket con dos líneas del mismo artículo suma ambas y agrupa compra',async()=>{
 const {ctx,App,db,fields,messages}=app();fields.tkDate={value:'2026-10-19'};fields.tkStore={value:'HEB'};
 const row=(qty,cost)=>({querySelector:key=>({'.tkItem':{value:'rice'},'.tkQty':{value:qty},'.tkCost':{value:cost}}[key]||null)});
 ctx.document.querySelectorAll=s=>s==='.ticket-row'?[row('2','20'),row('3','30')]:[];await App.saveTicket();
 assert.equal(db.read('items/rice').currentQty,15);assert.equal(db.read('movements/form-1-0').purchaseId,'form-1');assert.equal(db.read('movements/form-1-1').total,30);assert.ok(messages.includes('Ticket completo registrado'));
});
test('ticket que no cuadra no escribe ninguna línea',async()=>{
 const {ctx,App,db,fields,messages}=app();fields.tkDate={value:'2026-10-19'};fields.tkStore={value:''};fields.tkExpectedTotal={value:21};ctx.document.querySelectorAll=s=>s==='.ticket-row'?[{querySelector:key=>({'.tkItem':{value:'rice'},'.tkQty':{value:2},'.tkCost':{value:20}}[key]||null)}]:[];await App.saveTicket();assert.equal(db.read('items/rice').currentQty,10);assert.match(messages[0],/no coinciden/);
});
test('anular una compra revierte existencias y preserva documento',async()=>{const {App,db}=app({'movements/p':{itemId:'rice',itemName:'Arroz',type:'compra',date:'2026-10-19',qty:2,total:20,participantIds:['a','b']}});await App.confirmDeleteMovement('p');assert.equal(db.read('items/rice').currentQty,8);assert.equal(db.read('movements/p').voided,true);});
test('anular compra ya consumida se rechaza sin modificar ambos lados',async()=>{const {App,db,messages}=app({'movements/p':{itemId:'rice',type:'compra',date:'2026-10-19',qty:12,total:20}});await App.confirmDeleteMovement('p');assert.equal(db.read('items/rice').currentQty,10);assert.equal(db.read('movements/p').voided,undefined);assert.match(messages[0],/negativo/);});
test('pagos antiguos y nuevos suman una sola vez incluso con servicio archivado',()=>{const {api}=app();api.setBillData([{id:'luz',name:'Luz',archived:true,history:[{paidAt:'2026-10-01',amount:100,memberId:'a'}]}],[{id:'p',billId:'luz',paidAt:'2026-10-02',amount:200,memberId:'b',participantIds:['a','b']}]);assert.equal(api.allExpenseRows().reduce((s,r)=>s+r.amount,0),300);});
test('vista mensual y quincenal consultan el mismo saldo acumulado',()=>{const {api}=app();api.state.movements=[{type:'compra',date:'2026-09-01',total:100,memberId:'a',participantIds:['a','b']}];api.state.settlements=[{fromId:'b',toId:'a',amount:50,date:'2026-10-19',allocationDate:'2026-10-19'}];assert.equal(api.computeBalances('2026-10','mensual').transfers.length,0);assert.equal(api.computeBalances('2026-10-Q2','quincenal').transfers.length,0);});


test('pagador explícito puede ser distinto de quien registra; sin selección no se guarda',async()=>{
 const {ctx,App,db,fields,messages}=app();fields.tkDate={value:'2026-10-19'};fields.tkPayer={value:''};
 ctx.document.querySelectorAll=s=>s==='.ticket-row'?[{querySelector:key=>({'.tkItem':{value:'rice'},'.tkQty':{value:1},'.tkCost':{value:90}}[key]||null)}]:[];
 await App.saveTicket();assert.equal(db.read('movements/form-1-0'),undefined);assert.match(messages[0],/quién pagó/);
 fields.tkPayer.value='b';await App.saveTicket();assert.equal(db.read('movements/form-1-0').memberId,'b');assert.equal(db.read('items/rice').currentQty,11);
});

test('la cuenta vinculada define identidad y rechaza un selector antiguo o manipulado',()=>{
 const {api,App}=app();api.state.memberId='b';assert.equal(api.currentMember().id,'a');assert.equal(App.selectMember,undefined);
 api.setIdentity('b');assert.equal(api.currentMember().id,'b');api.setIdentity(null);assert.equal(api.currentMember(),null);
});
