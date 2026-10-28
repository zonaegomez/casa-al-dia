const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
test('desglose abre para receptor, emisor y tercero con ajustes negativos, positivos y cero',()=>{
 const {api,App,ctx}=app();api.state.members.push({id:'c',name:'C'});
 api.state.movements=[{id:'purchase',type:'compra',date:'2026-10-20',total:120,qty:1,itemName:'QA',memberId:'a',participantIds:['a','b']}];
 api.state.settlements=[{fromId:'b',toId:'a',amount:20,date:'2026-10-20'}];
 for(const [id,expected] of [['a','-$20.00'],['b','+$20.00'],['c','+$0.00']]){assert.doesNotThrow(()=>App.explainBalance(id));const html=ctx.document.getElementById('modalRoot').innerHTML;assert.ok(html.includes(expected),html);assert.ok(html.includes('Ver cada compra y servicio'));}
 assert.equal(api.computeBalances().balances.find(x=>x.member.id==='a').balance,40);
});
test('formulario mantiene datos y bloquea duplicado hasta marcar confirmación',async()=>{
 const {api,App,ctx,db,fields}=app();fields.tkDate={value:'2026-10-20'};fields.tkStore={value:'QA'};fields.tkExpectedTotal={value:'60'};fields.tkDuplicateWarning={hidden:true,innerHTML:''};
 const row={querySelector:s=>({'.tkItem':{value:'rice'},'.tkQty':{value:'1'},'.tkCost':{value:'60'}}[s]||null)};
 ctx.document.querySelectorAll=s=>s==='.ticket-row'?[row]:[];
 await App.saveTicket();assert.equal(db.read('items/rice').currentQty,11);
 api.state.formOperationId='form-2';const before=db.snapshot();await App.saveTicket();
 assert.equal(fields.tkDuplicateWarning.hidden,false);assert.ok(fields.tkDuplicateWarning.innerHTML.includes('Posible ticket duplicado'));assert.deepEqual(db.snapshot(),before);
 await App.saveTicket();assert.deepEqual(db.snapshot(),before);
 const encoded=fields.tkDuplicateWarning.innerHTML.match(/id="tkDuplicateToken" type="hidden" value="([^"]*)"/)[1];
 fields.tkDuplicateToken={value:encoded.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')};fields.tkAllowDuplicate={checked:true};
 await App.saveTicket();assert.equal(db.read('items/rice').currentQty,12);assert.equal(db.read('purchases/form-2').duplicateConfirmed,true);assert.equal(db.read('purchases/form-2').total,60);
});
