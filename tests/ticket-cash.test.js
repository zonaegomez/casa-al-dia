// Synthetic receipt/payment fixtures; no customer receipt data.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../core'),fakeDB=require('./fake-db');
function load(fetch=()=>{throw Error('unexpected provider call');}){
 const module={exports:{}},db=fakeDB();
 vm.runInNewContext(fs.readFileSync('api/parse-ticket.js','utf8'),{module,exports:module.exports,require:p=>p==='../core'?C:{authorize:async()=>({uid:'qa',db}),body:r=>r.body,fail:(res,e)=>res.status(e.status||500).json({error:e.message})},Buffer,AbortSignal,Date,Number,JSON,process:{env:{ANTHROPIC_API_KEY:'test-key'}},fetch});
 return module.exports;
}
const read=(total,price,payment)=>load().parseResult(JSON.stringify({lines:[{name:'Compra QA',price}],total,payment}));
test('efectivo entregado no es gasto: separa cambio solo si los productos confirman el neto',()=>{
 const p=read(200,165,{mode:'cash_only',tendered:200,change:35});
 assert.equal(p.total,165);assert.equal(p.lineTotal,165);assert.equal(p.difference,0);assert.equal(p.totalSource,'cash_minus_change');assert.equal(p.cashPayment.tendered,200);assert.equal(p.cashPayment.change,35);assert.equal(p.warnings.length,0);
});
test('total de venta correcto se conserva aunque el efectivo sea mayor',()=>{
 const p=read(165,165,{mode:'cash_only',tendered:200,change:35});assert.equal(p.total,165);assert.equal(p.totalSource,'printed');assert.equal(p.difference,0);
});
test('no inventa cambio ni modifica el total con pago mixto, tarjeta o datos incompletos',()=>{
 for(const payment of [{mode:'mixed',tendered:200,change:35},{mode:'card',tendered:200,change:35},{mode:'unknown',tendered:200,change:35},{mode:'cash_only',tendered:200},{mode:'cash_only',tendered:200,change:-35},{mode:'cash_only',tendered:200,change:null},{mode:'cash_only',tendered:'200',change:35},undefined]){
  const p=read(200,165,payment);assert.equal(p.total,200);assert.equal(p.difference,-35);assert.equal(p.cashPayment,null);assert.ok(p.warnings.length);
 }
});
test('si faltan productos no fuerza su suma a coincidir con efectivo menos cambio',()=>{
 const p=read(200,160,{mode:'cash_only',tendered:200,change:35});assert.equal(p.total,200);assert.equal(p.difference,-40);assert.ok(p.warnings.length);
});
test('efectivo exacto sin cambio conserva el total y no crea correcciones ficticias',()=>{
 const p=read(165,165,{mode:'cash_only',tendered:165,change:0});assert.equal(p.total,165);assert.equal(p.totalSource,'printed');assert.equal(p.difference,0);
});
async function runRetry(payment,secondName='Compra QA'){
 const outputs=[{lines:[{name:'Compra QA',price:165}],total:200,date:'2026-03-10',store:'Tienda QA'},{lines:[{name:secondName,price:165}],total:165,payment}];let calls=0;
 const handler=load(async()=>({ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(outputs[calls++])}]})}));
 const response={code:200,setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
 await handler({method:'POST',body:{imageBase64:Buffer.from([255,216,255,1]).toString('base64'),mediaType:'image/jpeg'}},response);return {response,calls};
}
test('segunda lectura puede corregir un total confundido con efectivo sin exigir otro descuento',async()=>{
 const {response,calls}=await runRetry({mode:'cash_only',tendered:200,change:35});assert.equal(calls,2);assert.equal(response.code,200);assert.equal(response.value.total,165);assert.equal(response.value.discountsApplied,0);assert.equal(response.value.difference,0);assert.equal(response.value.date,'2026-03-10');assert.equal(response.value.store,'Tienda QA');
});
test('segunda lectura no cambia el total sin evidencia de efectivo y cambio o si cambia productos',async()=>{
 for(const [payment,name] of [[undefined,'Compra QA'],[{mode:'mixed',tendered:200,change:35},'Compra QA'],[{mode:'cash_only',tendered:200,change:35},'Producto distinto']]){
  const {response}=await runRetry(payment,name);assert.equal(response.value.total,200);assert.equal(response.value.difference,-35);
 }
});
