const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
function setup(){const env=app();env.api.setIdentity('a');env.api.setUser({uid:'alice',getIdToken:async()=> 'test-token'});env.api.state.movements=[{id:'expense',type:'compra',total:20,memberId:'b',date:'2020-01-01',participantIds:['a','b']}];const loan={id:'loan',title:'Concepto confidencial',lenderUid:'alice',borrowerUid:'bob',lenderId:'a',borrowerId:'b',lenderName:'A',borrowerName:'B',amountCents:50000,status:'active',version:1,payments:[],events:[],createdAt:'2020-01-01'};env.api.setPrivateLoans([loan]);return {...env,loan};}
test('private offset sends a proposal, requires other user acceptance and names privacy limits',async()=>{
 const {api,App,ctx,fields,loan}=setup();assert.match(api.privateLoansBody(),/Compensar con deuda compartida/);
 App.openPrivateOffset('loan');fields.offsetAmount={value:'5.00'};let payload;
 ctx.fetch=async(url,opts)=>{assert.equal(url,'/api/loans');payload=JSON.parse(opts.body);return {ok:true,json:async()=>({})};};
 await App.savePrivateOffset('loan',1);assert.equal(payload.action,'propose-offset');assert.equal(payload.amount,'5.00');
 loan.payments=[{id:'proposed',kind:'offset',amountCents:500,status:'pending',proposedBy:'alice',reportedAt:'2020-01-01'}];
 assert.doesNotMatch(api.privateLoansBody(),/Aceptar compensación/);api.setUser({uid:'bob'});assert.match(api.privateLoansBody(),/Aceptar compensación/);assert.doesNotMatch(api.privateLoansBody(),/Ya recibí este abono/);
});
test('public adjustment does not reveal loan detail, claim a cash transfer or offer unilateral undo',async()=>{
 const {api,App,messages}=setup();api.state.settlements=[{id:'adjustment',kind:'agreed-adjustment',fromId:'a',toId:'b',fromName:'A',toName:'B',amount:10,date:'2020-01-01'}];
 const html=api.saldosBody('2020-01','mensual');assert.match(html,/ajuste acordado/);assert.match(html,/Sin movimiento de dinero/);assert.doesNotMatch(html,/Concepto confidencial|500\.00|confirmUndoSettlement/);
 await App.confirmUndoSettlement('adjustment');assert.match(messages.at(-1),/no se puede anular unilateralmente/);
});
