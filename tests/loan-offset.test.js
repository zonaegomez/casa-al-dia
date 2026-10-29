const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../core'),fake=require('./fake-db');
function load(path,dependencies){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path,'utf8'),{module,exports:module.exports,require:n=>dependencies[n]||require(n),structuredClone,Date,Math,Number,JSON,Error});return module.exports;}
const close=load('api/close-cycle.js',{'../core':C,'../server/firebase':{}});
const offset=load('server/loan-offset.js',{'../core':C,'../api/close-cycle':close});
const loans=load('server/loans.js',{'../core':C,'./loan-offset':offset});
function setup(extra={}){
 const db=fake({'access/alice':{enabled:true,memberId:'a'},'access/bob':{enabled:true,memberId:'b'},'access/eve':{enabled:true,memberId:'c'},'members/a':{name:'Persona A'},'members/b':{name:'Persona B'},'members/c':{name:'Persona C'},'settings/config':{revision:0,cycleStartDay:1,legacyParticipantIds:['a','b','c']},'privateLoans/loan':{participantUids:['alice','bob'],lenderUid:'alice',borrowerUid:'bob',lenderId:'a',borrowerId:'b',amountCents:50000,status:'active',version:1,createdBy:'alice',createdAt:'2020-01-01',payments:[],events:[]},'movements/house':{type:'compra',total:150,memberId:'c',date:'2020-01-01',participantIds:['a','b','c']},'movements/utility':{type:'compra',total:30,memberId:'b',date:'2020-01-01',participantIds:['a','b','c']},...extra});
 const base=db.runTransaction.bind(db);db.runTransaction=fn=>base(tx=>fn({...tx,get:r=>r.path?tx.get(r):r.get()}));return db;
}
const propose=(db,uid='alice',amount=10)=>loans.operate(db,uid,{action:'propose-offset',loanId:'loan',operationId:'proposal',expectedVersion:1,amount});
const confirm=(db,uid='bob',extra={})=>loans.operate(db,uid,{action:'confirm-offset',loanId:'loan',operationId:'accept-offset',paymentId:'proposal',expectedVersion:2,...extra});
test('bilateral acceptance atomically reduces opposite debts and exposes no private loan data',async()=>{
 const db=setup();await propose(db);assert.equal(loans.outstanding(db.read('privateLoans/loan')),50000);assert.equal(db.read('settings/config').revision,0);
 await assert.rejects(confirm(db,'alice'),/otra persona/);await assert.rejects(confirm(db,'eve'),/no disponible/);
 await confirm(db);const l=db.read('privateLoans/loan');assert.equal(loans.outstanding(l),49000);assert.equal(db.read('settings/config').revision,1);
 const publicDocs=Object.entries(db.snapshot()).filter(([p])=>p.startsWith('settlements/'));assert.equal(publicDocs.length,1);
 const [path,s]=publicDocs[0];assert.equal(s.amount,10);assert.equal(s.fromId,'a');assert.equal(s.toId,'b');assert.equal(s.kind,'agreed-adjustment');assert.equal(s.allocationDate,undefined);
 assert.deepEqual(Object.keys(s).sort(),['amount','date','fromId','fromName','kind','toId','toName','updatedBy']);assert.equal(l.payments[0].publicAdjustmentId,path.split('/')[1]);
 await confirm(db);assert.equal(Object.keys(db.snapshot()).filter(p=>p.startsWith('settlements/')).length,1);assert.equal(loans.outstanding(db.read('privateLoans/loan')),49000);
});
test('either party proposes, rejection changes no public balances, standard payment cannot confirm offset',async()=>{
 const db=setup();await propose(db,'bob');await assert.rejects(confirm(db,'bob'),/otra persona/);
 await assert.rejects(loans.operate(db,'alice',{action:'confirm-payment',loanId:'loan',operationId:'bypass',paymentId:'proposal',expectedVersion:2}),/no disponible/);
 await loans.operate(db,'alice',{action:'reject-offset',loanId:'loan',operationId:'reject',paymentId:'proposal',expectedVersion:2});
 assert.equal(loans.outstanding(db.read('privateLoans/loan')),50000);assert.equal(db.read('settings/config').revision,0);
 const other=setup();await propose(other,'bob');await confirm(other,'alice');assert.equal(loans.outstanding(other.read('privateLoans/loan')),49000);
});
test('rejects excessive proposals, stale versions, changed balances/bindings and closed cycles',async()=>{
 for(const n of [0,-1,10.01,501])await assert.rejects(propose(setup(),'alice',n));
 const db=setup();await propose(db);await assert.rejects(confirm(db,'bob',{expectedVersion:1}),/cambió/);
 const snapshot=db.snapshot();snapshot['movements/utility'].voided=true;await assert.rejects(confirm(setup(snapshot)),/cambiaron/);
 const disabled=db.snapshot();disabled['access/alice'].enabled=false;await assert.rejects(confirm(setup(disabled)),/vinculación/);
 const closed=db.snapshot();closed['closedCycles/'+C.cycle(C.today())]={total:0};const frozen=setup(closed);await assert.rejects(confirm(frozen),/cerrado/);assert.equal(loans.outstanding(frozen.read('privateLoans/loan')),50000);
});
test('failed commit and simultaneous acceptances cannot apply only one side or duplicate the adjustment',async()=>{
 const db=setup();await propose(db);db.failNext();await assert.rejects(confirm(db),/Injected/);assert.equal(loans.outstanding(db.read('privateLoans/loan')),50000);assert.equal(db.read('settings/config').revision,0);
 await Promise.all([confirm(db),confirm(db)]);assert.equal(loans.outstanding(db.read('privateLoans/loan')),49000);assert.equal(Object.keys(db.snapshot()).filter(p=>p.startsWith('settlements/')).length,1);
});
