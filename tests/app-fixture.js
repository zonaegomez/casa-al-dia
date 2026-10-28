const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../core'),create=require('../store'),fakeDB=require('./fake-db');
function app(seed={}){
 const db=fakeDB({'settings/config':{cycleStartDay:1,revision:0,legacyParticipantIds:['a','b']},'items/rice':{name:'Arroz',category:'despensa',currentQty:10,minQty:0},...seed});
 const fields={},messages=[],nodes={};let seq=0;
 const ctx={console:{error(){}},Intl,Date,Math,JSON,Number,Set,Map,Promise,Error,Object,Array,String,RegExp,createMonthlyService:require('../monthly-service'),CasaFinance:require('../finance-plans'),CasaCore:C,createCasaStore:create,createPurchaseService:require('../purchase-service'),createBillService:require('../bill-service'),createInventoryService:require('../inventory-service'),crypto:{randomUUID:()=>`uuid-${++seq}`},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{addEventListener(){},getElementById:id=>fields[id]||(['main','sidebar','modalRoot','mobileTopbar','mobileNav'].includes(id)?(nodes[id]||(nodes[id]={innerHTML:''})):null),querySelectorAll:()=>[],querySelector:()=>null},confirm:()=>true,setTimeout:()=>{},clearTimeout(){}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 const html=fs.readFileSync('index.html','utf8');const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const firebaseConfig'));
 vm.runInContext(script.replace('boot();\n})();',`render=()=>{};toast=msg=>globalThis.messages.push(msg);globalThis.api={state,allExpenseRows,computeBalances,currentMember,Data,setIdentity(id){accountMemberId=id;},setRole(role){accountRole=role;},setUser(user){signedInUser=user;},setAccess(db){state.db=db;accessReady=true;syncReady=true;signedInUser={uid:'test-uid',email:'qa@example.test'};accountMemberId='a';},setBillData(raw,payments){rawBills=raw;billPayments=payments;mergeBills();}};\n})();`),ctx);
 ctx.messages=messages;ctx.api.setAccess(db);Object.assign(ctx.api.state,{members:[{id:'a',name:'A'},{id:'b',name:'B'}],memberId:'a',items:[{id:'rice',name:'Arroz',category:'despensa',currentQty:10,minQty:0}],settings:{cycleStartDay:1,revision:0,legacyParticipantIds:['a','b']},formOperationId:'form-1'});
 return {ctx,api:ctx.api,App:ctx.App,db,fields,messages};
}
module.exports=app;
