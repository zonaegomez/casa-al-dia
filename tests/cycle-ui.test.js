const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core'),app=require('./app-fixture');
test('cierre desde interfaz bloquea ciclos actuales y futuros antes de confirmar o llamar al servidor',async()=>{
 const {ctx,App,messages}=app();let confirmations=0,requests=0;
 ctx.confirm=()=>{confirmations++;return true;};ctx.fetch=async()=>{requests++;throw Error('Unexpected request');};
 for(const key of [C.cycle(C.today(),1),'2999-01']){await App.confirmCloseCycle(key);assert.match(messages.at(-1),/ya terminaron/);}
 assert.equal(confirmations,0);assert.equal(requests,0);
});
