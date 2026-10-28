const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
test('opening setup and payments require admin before presenting or changing records',async()=>{
 const {api,App,db,messages}=app();api.setRole('member');const before=db.snapshot();
 assert.throws(()=>App.openFinanceSetup(),/administrador/);assert.throws(()=>App.openMonthlyContribution(),/administrador/);
 await App.saveMonthlyContribution();assert.match(messages.at(-1),/administrador/);await App.reverseMonthlyContribution('x');assert.match(messages.at(-1),/administrador/);await App.payCollectedRent('x');assert.match(messages.at(-1),/administrador/);
 await App.saveFinanceSetup();assert.match(messages.at(-1),/administrador/);
 await App.recordFinancePayment('a','entry',0);assert.match(messages.at(-1),/administrador/);
 await App.renameFinancePlan();assert.match(messages.at(-1),/administrador/);
 await App.undoFinancePayment('a');assert.match(messages.at(-1),/administrador/);assert.deepEqual(db.snapshot(),before);
});
test('opening confirmation writes one shared plan, leaves expenses and provider payments untouched',async()=>{
 const {api,App,ctx,db,fields,messages}=app();api.setRole('admin');api.state.members=[{id:'a',name:'Persona A'},{id:'b',name:'Persona B'},{id:'c',name:'Persona C'}];
 Object.assign(fields,{fpCount:{value:'6'},fpEntryLabel:{value:'Adelanto compartido'},fpEquipmentLabel:{value:'Compra compartida'},fpCreditor:{value:'c'},fpStart:{value:'2026-10-15'},fpEquipment:{value:'600.01'},fpMonthly:{value:'33.33'},fpFirstPaid:{checked:true}});
 const rows=[['a',1000,300],['b',1100,350],['c',1200,400]].map(([memberId,entry,rent])=>({querySelector:s=>s==='.fp-include'?{checked:true}:({value:s==='.fp-member'?memberId:s==='.fp-entry'?String(entry):String(rent)})}));
 ctx.document.querySelectorAll=s=>s==='.fp-row'?rows:[];
 ctx.confirm=()=>false;await App.saveFinanceSetup();assert.equal(db.read('settings/config').financePlan,undefined);
 ctx.confirm=()=>true;await App.saveFinanceSetup();const config=db.read('settings/config');assert.equal(config.financePlan.payments.length,5);assert.equal(config.financePlan.providerPayments.length,0);assert.equal(config.revision,1);
 assert.equal(Object.keys(db.snapshot()).filter(k=>k.startsWith('movements/')).length,0);assert.match(messages.at(-1),/registrado/);
 await App.saveFinanceSetup();assert.equal(db.read('settings/config').financePlan.payments.length,5);
});
