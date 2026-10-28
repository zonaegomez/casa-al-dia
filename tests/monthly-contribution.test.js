const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core'),F=require('../finance-plans'),makeStore=require('../store'),makeMonthly=require('../monthly-service'),makeBills=require('../bill-service'),fakeDB=require('./fake-db');
// Fictional household; all dates and figures below are synthetic.
function setup(extra={}){
 const members=['a','b','c'].map(id=>({id,name:'Persona '+id})),rows=[{memberId:'a',entryTotal:600,rent:100},{memberId:'b',entryTotal:1200,rent:200},{memberId:'c',entryTotal:1800,rent:300}];
 const plan=F.create({rows,creditorId:'c',startDate:'2020-01-15',equipmentTotal:900,equipmentMonthly:50,firstPaid:true},members),receiptId='rent-2020-02-15';
 const receipt={billId:'rent',name:'Servicio compartido',dueDate:'2020-02-15',amount:600,period:'2020-02',participantIds:['a','b','c'],beneficiaryShares:[{memberId:'a',amount:100},{memberId:'b',amount:200},{memberId:'c',amount:300}]};
 const db=fakeDB({'settings/config':{cycleStartDay:1,revision:0,financePlan:plan},['billReceipts/'+receiptId]:receipt,'bills/rent':{name:'Servicio compartido',amountEstimate:600,nextDueDate:'2020-02-15',cycle:'mensual',history:[],paymentIds:[],participantIds:['a','b','c']},...extra});let sequence=0;
 const store=makeStore({state:{members},core:C,db:()=>db,actor:()=> 'admin',ready:()=>true,newId:()=> 'op-'+(++sequence)}),monthly=makeMonthly({store,C,F});
 const bills=makeBills({store,C,members:()=>members,addMonths:(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);}});
 const input=(memberId='a')=>({memberId,month:'2020-02',date:'2020-02-15',receiptId,rent:memberId==='a'?100:memberId==='b'?200:300,entry:memberId==='a'?100:memberId==='b'?200:0,equipment:50,total:memberId==='a'?250:memberId==='b'?450:350});
 return {db,store,monthly,bills,input,receiptId,members,receipt};
}
test('one receipt of money allocates plan installments and held rent atomically; retry does not duplicate',async()=>{
 const {db,monthly,input,receiptId}=setup(),before=db.read('settings/config').financePlan;await monthly.receive(input(),{opId:'receive'});await monthly.receive(input(),{opId:'receive'});
 const plan=db.read('settings/config').financePlan;assert.equal(plan.contributions.length,1);assert.equal(plan.contributions[0].total,250);assert.equal(monthly.held(plan,receiptId),100);
 assert.equal(F.paid(plan,'a','entry',1),100);assert.equal(F.paid(plan,'a','equipment',1),50);assert.equal(F.remaining(plan,plan.rows[0],'entry'),F.remaining(before,before.rows[0],'entry')-100);
 assert.equal(Object.keys(db.snapshot()).filter(k=>k.startsWith('billPayments/')).length,0);assert.equal(db.read('bills/rent').nextDueDate,'2020-02-15');
});
test('collected rent pays the provider once with original funding shares, then can be safely reversed',async()=>{
 const s=setup();for(const id of ['a','b','c'])await s.monthly.receive(s.input(id),{opId:'receive-'+id});
 const pid=await s.bills.payCollected(s.receiptId,'2020-02-16',{opId:'pay-provider'});assert.equal(await s.bills.payCollected(s.receiptId,'2020-02-16',{opId:'pay-provider'}),pid);
 const payment=s.db.read('billPayments/'+pid);assert.equal(payment.amount,600);assert.deepEqual(payment.splits,[{memberId:'a',amount:100},{memberId:'b',amount:200},{memberId:'c',amount:300}]);assert.equal(payment.executedByMemberId,'c');assert.equal(s.db.read('bills/rent').nextDueDate,'2020-03-15');
 assert.equal(s.monthly.held(s.db.read('settings/config').financePlan,s.receiptId),0);
 assert.equal(C.receiptProgress({...s.receipt,id:s.receiptId},[payment]).pending,0);
 await assert.rejects(()=>s.monthly.reverse('receive-a',{opId:'reverse-before-provider'}),/Anula primero/);
 await s.bills.edit('rent',pid,{voided:true},{opId:'void-provider'});assert.equal(s.monthly.held(s.db.read('settings/config').financePlan,s.receiptId),600);assert.equal(s.db.read('bills/rent').nextDueDate,'2020-02-15');
 await s.monthly.reverse('receive-a',{opId:'reverse-a'});const plan=s.db.read('settings/config').financePlan;assert.equal(s.monthly.held(plan,s.receiptId),500);assert.equal(F.paid(plan,'a','entry',1),0);assert.equal(F.paid(plan,'a','equipment',1),0);assert.equal(plan.contributions[0].voided,true);
});
test('mismatched total, overpayment, duplicate operation races and failed commit never leave partial allocations',async()=>{
 const s=setup(),before=s.db.snapshot();await assert.rejects(()=>s.monthly.receive({...s.input(),total:1},{opId:'bad-total'}),/desglose/);assert.deepEqual(s.db.snapshot(),before);
 await assert.rejects(()=>s.monthly.receive({...s.input(),entry:101,total:251},{opId:'overpay'}),/cambió/);assert.deepEqual(s.db.snapshot(),before);
 s.db.failNext();await assert.rejects(()=>s.monthly.receive(s.input(),{opId:'failed'}),/Injected/);assert.deepEqual(s.db.snapshot(),before);
 const result=await Promise.allSettled([s.monthly.receive(s.input(),{opId:'device-a'}),s.monthly.receive(s.input(),{opId:'device-b'})]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.db.read('settings/config').financePlan.contributions.length,1);
});
test('partial transfer may allocate selected concepts; individual installment reversal cannot break its receipt',async()=>{
 const s=setup();await s.monthly.receive({...s.input(),entry:25,equipment:10,rent:40,total:75},{opId:'partial'});let p=s.db.read('settings/config').financePlan;
 assert.equal(F.paid(p,'a','entry',1),25);assert.equal(s.monthly.held(p,s.receiptId),40);assert.throws(()=>F.reverse(p,'partial-entry','bad-reversal'),/aportación completa/);
 await s.monthly.receive({...s.input(),entry:75,equipment:40,rent:60,total:175},{opId:'remainder'});p=s.db.read('settings/config').financePlan;assert.equal(F.paid(p,'a','entry',1),100);assert.equal(s.monthly.held(p,s.receiptId),100);
});
test('manual provider payment cannot consume held funds a second time; paid and closed receipts reject intake',async()=>{
 const s=setup();await s.monthly.receive(s.input(),{opId:'receive'});
 await assert.rejects(()=>s.bills.pay('rent',{receiptTotal:600,amount:600,dueDate:'2020-02-15',paidAt:'2020-02-16',memberId:'c',participantIds:['a','b','c']},{opId:'manual'}),/aportaciones recibidas/);
 const closed=setup({'closedCycles/2020-02':{closedAt:'2020-03-01'}});await assert.rejects(()=>closed.monthly.receive(closed.input(),{opId:'closed'}),/cerrado/);
 const paid=setup({'bills/rent':{amountEstimate:600,nextDueDate:'2020-03-15',cycle:'mensual',history:[],paymentIds:['existing']},'billPayments/existing':{receiptId:s.receiptId,amount:600,memberId:'c',paidAt:'2020-02-15'}});await assert.rejects(()=>paid.monthly.receive(paid.input(),{opId:'paid'}),/ya fue pagado/);
});
