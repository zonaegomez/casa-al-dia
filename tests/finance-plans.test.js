const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance-plans'),C=require('../core'),store=require('../store'),dbFactory=require('./fake-db');
// Fictional figures and identities; no household records.
const members=['a','b','c'].map(id=>({id,name:'Persona '+id}));
const input=()=>({creditorId:'c',startDate:'2026-10-15',equipmentTotal:600.01,equipmentMonthly:33.33,firstPaid:true,rows:[{memberId:'a',entryTotal:1000,rent:300},{memberId:'b',entryTotal:1100,rent:350},{memberId:'c',entryTotal:1200,rent:400}]});
test('six installments cross year, preserve cents and never create self debt',()=>{
 const p=F.create(input(),members);assert.equal(p.dates[5],'2027-03-15');assert.equal(p.rows[2].entry.reduce((s,n)=>s+n,0),0);
 assert.equal(p.rows.reduce((s,r)=>s+r.equipment.reduce((n,x)=>n+Math.round(x*100),0),0),60001);
 for(const r of p.rows.slice(0,2))assert.equal(r.entry.reduce((s,n)=>s+Math.round(n*100),0),Math.round(r.entryTotal*100));
 assert.equal(p.providerPayments.length,0);assert.equal(p.payments.length,5);assert.equal(F.remaining(p,p.rows[0],'entry'),833.33);
});
test('cash paid to creditor never settles provider; both independently reversible',()=>{
 let p=F.create(input(),members);const amount=p.rows.reduce((s,r)=>s+r.equipment[0],0);
 p=F.pay(p,{kind:'provider',index:0,date:'2026-10-16',id:'provider',amount});assert.equal(p.payments.length,5);assert.equal(p.providerPayments.length,1);
 assert.throws(()=>F.pay(p,{kind:'provider',index:0,date:'2026-10-16',id:'again',amount}),/ya está/);
 p=F.reverse(p,'opening-a-entry','undo');assert.equal(F.remaining(p,p.rows[0],'entry'),1000);assert.equal(p.payments.length,5);assert.equal(p.payments[0].voided,true);
 p=F.reverse(p,'provider','undo-credit');assert.equal(p.providerPayments[0].voided,true);
 p=F.pay(p,{kind:'provider',index:0,date:'2026-10-17',id:'replacement',amount});assert.equal(p.providerPayments.length,2);
});
test('reject duplicate identities, impossible installments, invalid dates and overpayment',()=>{
 const x=input();x.rows[1].memberId='a';assert.throws(()=>F.create(x,members),/distintos/);
 assert.throws(()=>F.create({...input(),equipmentMonthly:1000},members),/cuotas/);
 assert.throws(()=>F.create({...input(),startDate:'2026-13-15'},members),/válid/);
 const p=F.create(input(),members);assert.throws(()=>F.pay(p,{memberId:'a',kind:'entry',index:1,date:'2026-11-15',id:'x',amount:999}),/cambió/);
});
test('concurrent duplicate installment is rejected and operation retries are idempotent without expenses',async()=>{
 const p=F.create(input(),members),db=dbFactory({'settings/config':{cycleStartDay:1,revision:0,financePlan:p}});let seq=0;
 const S=store({state:{members},core:C,db:()=>db,actor:()=> 'admin',ready:()=>true,newId:()=>String(++seq)});
 const pay=id=>S.atomic({kind:'opening-plan-payment',opId:id},async t=>{const next=F.pay(t.config.financePlan,{memberId:'a',kind:'entry',index:1,date:'2026-11-15',id:t.id,amount:p.rows[0].entry[1]});await t.put('settings','config',{financePlan:next,revision:Number(t.config.revision)+1});return 'ok';});
 const result=await Promise.allSettled([pay('one'),pay('two')]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 const id=result[0].status==='fulfilled'?'one':'two';assert.equal(await pay(id),'ok');assert.equal(db.read('settings/config').financePlan.payments.length,6);
 assert.equal(Object.keys(db.snapshot()).filter(k=>/^(movements|settlements|purchases|billPayments)\//.test(k)).length,0);
});
test('another household can use two people, twelve months and month-end dates without a financed purchase',()=>{
 const p=F.create({creditorId:'b',startDate:'2028-01-31',installmentCount:12,entryLabel:'Mudanza compartida',equipmentTotal:0,equipmentMonthly:0,firstPaid:false,rows:[{memberId:'a',entryTotal:500,rent:0},{memberId:'b',entryTotal:0,rent:0}]},members);
 assert.equal(p.rows.length,2);assert.equal(p.dates.length,12);assert.equal(p.dates[1],'2028-02-29');assert.equal(p.dates[2],'2028-03-31');assert.equal(p.entryLabel,'Mudanza compartida');assert.equal(p.rows[0].entry.reduce((s,n)=>s+Math.round(n*100),0),50000);assert.equal(p.payments.length,0);
 assert.throws(()=>F.pay(p,{kind:'provider',index:0,date:'2028-01-31',id:'no-credit',amount:0}),/No hay/);
});
test('four people can finance a purchase alone, with automatic quotas and optional fixed reference',()=>{
 const people=['a','b','c','d'].map(id=>({id}));
 const p=F.create({creditorId:'d',startDate:'2026-11-08',installmentCount:3,equipmentLabel:'Refrigerador',equipmentTotal:100.01,equipmentMonthly:0,rows:people.map(m=>({memberId:m.id,entryTotal:0,rent:0}))},people);
 assert.equal(p.rows.length,4);assert.equal(p.dates[2],'2027-01-08');assert.equal(p.rows.reduce((s,r)=>s+r.equipment.reduce((n,x)=>n+Math.round(x*100),0),0),10001);assert.equal(p.rows[3].equipment.reduce((s,x)=>s+Math.round(x*100),0),2501);assert.equal(p.rows[0].equipment[0],8.33);
 assert.throws(()=>F.create({...input(),installmentCount:61},members),/60 cuotas/);
});
test('existing six-month plans keep all balances and history when their descriptions change',()=>{
 const p=F.create(input(),members);delete p.entryLabel;delete p.equipmentLabel;p.version=1;
 const next=F.rename(p,'Gastos iniciales','Electrodomésticos');assert.deepEqual(next.rows,p.rows);assert.deepEqual(next.payments,p.payments);assert.deepEqual(next.dates,p.dates);assert.equal(next.entryLabel,'Gastos iniciales');assert.equal(next.equipmentLabel,'Electrodomésticos');
 assert.throws(()=>F.rename(p,'x'.repeat(81),'Compra'),/80 caracteres/);
});
