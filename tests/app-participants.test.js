const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
test('formulario guardado distingue beneficiario de pagador y bloquea selección vacía',async()=>{
 const old={id:'old',type:'compra',itemName:'Compra QA',date:'2026-10-20',category:'despensa',qty:1,total:100,memberId:'a',memberName:'A',participantIds:['a','b'],beneficiaryShares:[{memberId:'a',amount:50},{memberId:'b',amount:50}]};
 const {api,ctx,App,db,fields,messages}=app({'movements/old':old});api.state.movements=[old];
 for(const [id,value] of Object.entries({emName:'Compra QA',emAmount:'100',emDate:'2026-10-20',emCat:'despensa',emMember:'a'}))fields[id]={value};
 let selected=[];ctx.document.querySelectorAll=selector=>selector==='.em-beneficiary:checked'?selected.map(value=>({value})):[];
 await App.saveEditMovement('old');assert.match(messages.at(-1),/Selecciona al menos una persona/);assert.deepEqual(db.read('movements/old'),old);
 selected=['b'];await App.saveEditMovement('old');
 const saved=db.read('movements/old');assert.deepEqual(saved.participantIds,['b']);assert.deepEqual(saved.beneficiaryShares,[{memberId:'b',amount:100}]);assert.equal(saved.memberId,'a');assert.equal(saved.total,100);assert.equal(db.read('items/rice').currentQty,10);
});
