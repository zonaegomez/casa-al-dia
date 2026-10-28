const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../core'),fake=require('./fake-db'),app=require('./app-fixture');
function loadRoute(path,extras={}){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path,'utf8'),{module,exports:module.exports,require:name=>name==='../core'?C:name==='./close-cycle'?extras:{},Date,Math,Number,JSON,Error});return module.exports;}
const expenseRows=(...args)=>{
 const [movements,bills,payments,legacy,receipts=[]]=args;
 return movements.filter(m=>!m.voided&&m.type==='compra').map(m=>({date:m.date,amount:m.total,memberId:m.memberId,participantIds:m.participantIds||legacy,beneficiaryShares:m.beneficiaryShares}));
};
const settle=loadRoute('api/settle.js',{expenseRows}).settle;
function setup(extra={}){
 const db=fake({'settings/config':{revision:0,cycleStartDay:1,legacyParticipantIds:['a','b','c']},'members/a':{name:'Persona A'},'members/b':{name:'Persona B'},'members/c':{name:'Persona C'},'movements/p':{type:'compra',total:150,memberId:'c',date:'2020-02-01',participantIds:['a','b','c']},...extra});
 const original=db.runTransaction.bind(db);db.runTransaction=fn=>original(tx=>fn({...tx,get:ref=>ref.path?tx.get(ref):ref.get()}));return db;
}
const input=(patch={})=>({fromId:'a',toId:'c',amount:49.33,date:'2020-02-15',expectedRevision:0,operationId:'settlement-fixture',...patch});
test('partial historical reimbursement preserves cents, date and retry idempotence',async()=>{
 const db=setup(),r=await settle(db,'actor',input());assert.equal(r.amount,49.33);assert.equal(r.date,'2020-02-15');assert.equal(r.allocationDate,'2020-02-15');
 const balance=C.balances(expenseRows([{type:'compra',total:150,memberId:'c',date:'2020-02-01',participantIds:['a','b','c']}],[],[],['a','b','c']),[{id:'a'},{id:'b'},{id:'c'}],[r]);assert.equal(Math.round(balance.balances.find(x=>x.member.id==='a').balance*100),-67);
 await settle(db,'actor',input());assert.equal(Object.keys(db.snapshot()).filter(p=>p.startsWith('settlements/')).length,1);
 await assert.rejects(settle(db,'actor',input({amount:49})),/otra transferencia/);
});
test('rejects invalid/future dates, closed historical cycles, excess and stale balance without writes',async()=>{
 for(const patch of [{date:'2999-01-01'},{date:'2020-02-31'},{date:''},{amount:50.01},{expectedRevision:1}]){const db=setup();await assert.rejects(settle(db,'actor',input(patch)));assert.equal(db.read('settlements/settlement-fixture'),undefined);}
 const db=setup({'closedCycles/2020-02':{total:150}});await assert.rejects(settle(db,'actor',input()),/cerrado/);assert.equal(db.read('settlements/settlement-fixture'),undefined);
});
test('legacy caller without date uses current date',async()=>{const db=setup(),i=input();delete i.date;assert.equal((await settle(db,'actor',i)).date,C.today());});
test('UI opens editable amount/date and sends actual values without making a second expense',async()=>{
 const {App,ctx,api,fields}=app();let payload;
 api.setUser({getIdToken:async()=> 'fixture-token'});ctx.fetch=async(url,opts)=>{assert.equal(url,'/api/settle');payload=JSON.parse(opts.body);return {ok:true,json:async()=>({})};};
 await App.markTransferPaid('', '', 'a','Persona A','c','Persona C',50);
 fields.transferAmount={value:'49.33'};fields.transferDate={value:'2020-02-15'};
 const operationId=api.state.pendingTransfer.operationId;await App.confirmTransferPayment();
 assert.equal(payload.amount,49.33);assert.equal(payload.date,'2020-02-15');assert.equal(payload.operationId,operationId);assert.equal(api.state.pendingTransfer,null);
});
