// Local fixture only: no Firebase connection, no production data.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8').replace('boot();\n})();',`window.__qa={state,render,activate(){accessReady=true;syncReady=true;}};render();\n})();`);
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/vendor/')){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync('public'+req.url));return;}const path=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','core.js','store.js','purchase-service.js','bill-service.js','runtime-config.js'].includes(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.html')?'text/html':'application/javascript');res.end(path==='index.html'?html:fs.readFileSync(path));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({headless:true,...(process.env.CASA_CHROMIUM_PATH?{executablePath:process.env.CASA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']}:{} )});}catch(e){server.close();throw e;}const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#loginEmail').waitFor();
  await page.evaluate(()=>{const q=window.__qa;q.activate();Object.assign(q.state,{members:[{id:'a',name:'Erick',color:'#6258E8'},{id:'b',name:'Axel',color:'#3E6DF6'}],memberId:'a',items:[{id:'rice',name:'Arroz',category:'despensa',unit:'kg',currentQty:2,minQty:1},{id:'coffee',name:'Café',category:'despensa',unit:'paquete',currentQty:0,minQty:0,trackingMode:'simple',stockStatus:'hay'}],movements:[{id:'m',type:'compra',qty:2,total:100,date:'2026-10-19',memberId:'a',memberName:'Erick',participantIds:['a','b'],category:'despensa',itemName:'Arroz'}],dbMode:'live'});q.render();});
  for(const surface of ['dashboard','ubicaciones','super','inventario','servicios','cuentas','recordatorios','ciclos','config']){
   await page.evaluate(surface=>App.go(surface),surface);assert.ok((await page.locator('#main').innerText()).trim(),surface);
  }
  await page.evaluate(()=>{App.go('cuentas');App.setCuentasTab('saldos');});await page.getByText('Saldo acumulado de toda la casa.',{exact:false}).waitFor();
  await page.setViewportSize({width:390,height:844});
  for(const surface of ['dashboard','inventario','cuentas','config']){await page.evaluate(p=>App.go(p),surface);assert.ok(await page.locator('#main').isVisible());}
  await page.evaluate(()=>App.openItemForm('coffee'));assert.equal(await page.locator('#itTracking').inputValue(),'simple');
  await page.evaluate(()=>{App.closeModal();App.openTicket();});assert.equal(await page.locator('.tk-beneficiary').count(),2);await page.locator('#tkKind').selectOption('espontaneo');await page.locator('.tkCost').first().fill('100');await page.evaluate(()=>App.updateTicketTotal());await page.locator('#tkExpectedTotal').fill('100');await page.locator('#tkMode').selectOption('deuda');assert.equal(await page.locator('.tk-debt-input').first().inputValue(),'50');assert.ok(await page.locator('#tkDeudaRows').isVisible());await page.evaluate(()=>{App.closeModal();window.__qa.state.bills=[{id:'internet',name:'Internet',nextDueDate:'2026-10-31',cycle:'mensual',history:[]}];App.openPayBill('internet');});assert.equal(await page.locator('#payDueDate').inputValue(),'2026-10-31');assert.deepEqual(errors,[]);console.log('Navegación, saldo acumulado y formulario de inventario verificados en escritorio y móvil.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
