// All people, quantities and monetary figures below are fictional test fixtures.
// Local fixture only: no Firebase connection, no production data.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8').replace('boot();\n})();',`window.__qa={state,render,monthlyFixture(db){state.db=db;const snap=db.snapshot(),rows=coll=>Object.entries(snap).filter(([path,v])=>path.startsWith(coll+'/')&&!v.voided).map(([path,v])=>({id:path.split('/')[1],...v}));state.settings=snap['settings/config'];state.billReceipts=rows('billReceipts');rawBills=rows('bills');billPayments=rows('billPayments');mergeBills();},financeIdentity(id,role){accountMemberId=id;accountRole=role;},passwordUser(user){signedInUser=user;},activate(){accessReady=true;syncReady=true;signedInUser={uid:'qa-a',email:'qa@example.test'};accountMemberId='a';},loanFixture(){signedInUser={uid:'qa-a',email:'qa@example.test'};accountMemberId='a';privateLoanMessage='';privateLoans=[{id:'qa-private',participantUids:['qa-a','qa-b'],lenderUid:'qa-a',borrowerUid:'qa-b',lenderName:'Persona A',borrowerName:'Persona B',lenderId:'a',borrowerId:'b',title:'Préstamo QA',amountCents:50000,status:'active',createdBy:'qa-a',version:2,createdAt:'2026-10-27T12:00:00Z',payments:[],events:[]}];}};render();\n})();`);
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/vendor/')){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync('public'+req.url));return;}const path=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','core.js','store.js','purchase-service.js','bill-service.js','inventory-service.js','finance-plans.js','monthly-service.js','runtime-config.js'].includes(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.html')?'text/html':'application/javascript');res.end(path==='index.html'?html:fs.readFileSync(path));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({headless:true,...(process.env.CASA_CHROMIUM_PATH?{executablePath:process.env.CASA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader']}:{} )});}catch(e){server.close();throw e;}const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#loginEmail').waitFor();
  const photoResult=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=2400;
   const context=canvas.getContext('2d'),image=context.createImageData(canvas.width,canvas.height);let seed=123456789;
   for(let i=0;i<image.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;image.data[i]=seed&255;image.data[i+1]=(seed>>>8)&255;image.data[i+2]=(seed>>>16)&255;image.data[i+3]=255;}
   context.putImageData(image,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',1));
   const file=new File([blob],'ticket.jpg',{type:'image/jpeg'}),result=await App.prepareTicketPhoto(file);
   window.__photoQA=file;return {before:file.size,after:result.blob.size,type:result.mediaType,compressed:result.compressed};
  });
  assert.ok(photoResult.before>1800000);assert.ok(photoResult.after<=1800000);assert.equal(photoResult.type,'image/jpeg');assert.equal(photoResult.compressed,true);
  const uploaded=await page.evaluate(async()=>{
   const originalFetch=window.fetch;let bytes=0;
   window.__qa.passwordUser({uid:'qa-a',getIdToken:async()=>'qa-token'});
   window.fetch=async(url,options)=>{bytes=JSON.parse(options.body).imageBase64.length;return {ok:true,json:async()=>({lines:[]})};};
   try{await App.scanTicketPhoto(window.__photoQA);return bytes;}finally{window.fetch=originalFetch;delete window.__photoQA;}
  });
  assert.ok(uploaded>0);assert.ok(uploaded<=2800000);

  await page.evaluate(()=>{const q=window.__qa;q.activate();Object.assign(q.state,{members:[{id:'a',name:'Persona A',color:'#6258E8'},{id:'b',name:'Persona B',color:'#3E6DF6'}],memberId:'a',items:[{id:'rice',name:'Arroz',category:'despensa',unit:'kg',currentQty:2,minQty:1},{id:'coffee',name:'Café',category:'despensa',unit:'paquete',currentQty:0,minQty:0,trackingMode:'simple',stockStatus:'hay'}],movements:[{id:'m',type:'compra',qty:2,total:100,date:'2026-10-19',memberId:'a',memberName:'Persona A',participantIds:['a','b'],category:'despensa',itemName:'Arroz'}],dbMode:'live'});q.render();});
  for(const surface of ['dashboard','ubicaciones','super','inventario','servicios','cuentas','recordatorios','ciclos','config']){
   await page.evaluate(surface=>App.go(surface),surface);assert.ok((await page.locator('#main').innerText()).trim(),surface);
  }
  await page.evaluate(()=>{
   window.__cycleRowsQA=window.__qa.state.movements;
   const row=date=>({id:'qa-'+date,type:'compra',qty:1,total:1,date,memberId:'a',memberName:'Persona A',participantIds:['a','b'],category:'despensa',itemName:'Ciclo QA'});
   window.__qa.state.movements=[...window.__cycleRowsQA,row('2999-01-01'),row('2000-01-01'),row(CasaCore.today())];App.go('ciclos');
  });
  const futureRow=page.locator('tr').filter({hasText:'2999'});assert.equal(await futureRow.getByRole('button',{name:'Cerrar',exact:true}).count(),0);assert.ok((await futureRow.innerText()).includes('Futuro'));
  const pastRow=page.locator('tr').filter({hasText:'2000'});assert.equal(await pastRow.getByRole('button',{name:'Cerrar',exact:true}).count(),1);
  const currentRow=page.locator('tr').filter({hasText:'En curso'});assert.equal(await currentRow.getByRole('button',{name:'Cerrar',exact:true}).count(),0);
  await page.evaluate(()=>{window.__qa.state.movements=window.__cycleRowsQA;delete window.__cycleRowsQA;});
  await page.evaluate(()=>{App.go('cuentas');App.setCuentasTab('saldos');});await page.getByText('Saldo acumulado de toda la casa.',{exact:false}).waitFor();
  await page.setViewportSize({width:390,height:844});
  for(const surface of ['dashboard','inventario','cuentas','config']){await page.evaluate(p=>App.go(p),surface);assert.ok(await page.locator('#main').isVisible());}
  await page.evaluate(source=>{const module={exports:{}};new Function('module',source)(module);const q=window.__qa,seed={'settings/config':{cycleStartDay:1,revision:0,legacyParticipantIds:['a','b']}};for(const coll of ['items','movements'])for(const row of q.state[coll])seed[coll+'/'+row.id]=row;const db=module.exports(seed),base=db.runTransaction;db.runTransaction=async fn=>{const r=await base(fn),snapshot=db.snapshot();for(const coll of ['items','movements'])q.state[coll]=Object.entries(snapshot).filter(([path,v])=>path.startsWith(coll+'/')&&!v.voided).map(([path,v])=>({id:path.split('/')[1],...v}));return r;};q.state.db=db;App.go('inventario');},fs.readFileSync('tests/fake-db.js','utf8'));
  const acceptEdit=dialog=>dialog.accept();page.on('dialog',acceptEdit);
  await page.evaluate(()=>App.openEditMovement('m'));
  assert.equal(await page.locator('.em-beneficiary:checked').count(),2);
  await page.locator('.em-beneficiary[value="a"]').uncheck();
  await page.getByText('Parte de este producto: Persona B $100.00',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.waitForFunction(()=>JSON.stringify(window.__qa.state.movements.find(m=>m.id==='m').participantIds)==='["b"]');
  assert.equal(await page.evaluate(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty),2);
  await page.evaluate(()=>App.openEditMovement('m'));
  assert.equal(await page.locator('.em-beneficiary[value="a"]').isChecked(),false);
  assert.equal(await page.locator('.em-beneficiary[value="b"]').isChecked(),true);
  await page.locator('.em-beneficiary[value="b"]').uncheck();
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.getByText('Selecciona al menos una persona para este producto',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__qa.state.movements.find(m=>m.id==='m').participantIds),['b']);
  await page.locator('.em-beneficiary[value="a"]').check();await page.locator('.em-beneficiary[value="b"]').check();
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.waitForFunction(()=>window.__qa.state.movements.find(m=>m.id==='m').participantIds.length===2);
  page.off('dialog',acceptEdit);
  await page.evaluate(()=>{window.__qa.state.items.find(i=>i.id==='rice').unit='rollo';window.__qa.render();});assert.ok(await page.getByRole('button',{name:'Saqué 1 rollo',exact:true}).isVisible());await page.evaluate(()=>{window.__qa.state.items.find(i=>i.id==='rice').unit='kg';window.__qa.render();});await page.getByRole('button',{name:'Usé 1 kg',exact:true}).click();await page.getByText('Quedan 1.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty),1);await page.getByRole('button',{name:'Deshacer',exact:true}).click();await page.waitForFunction(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty===2);
  await page.getByRole('button',{name:'Se acabó',exact:true}).click();await page.waitForFunction(()=>window.__qa.state.items.find(i=>i.id==='coffee').stockStatus==='comprar');await page.evaluate(()=>App.go('super'));assert.ok((await page.locator('#main').innerText()).includes('Café'));await page.evaluate(()=>App.go('inventario'));await page.getByRole('button',{name:'Hay',exact:true}).click();await page.waitForFunction(()=>window.__qa.state.items.find(i=>i.id==='coffee').stockStatus==='hay');
  await page.getByRole('button',{name:'Más opciones',exact:true}).click();assert.equal(await page.locator('#mvDate').isVisible(),false);assert.equal(await page.locator('#mvNote').isVisible(),false);await page.locator('#modalRoot details summary').click();assert.ok(await page.locator('#mvDate').isVisible());assert.ok(await page.locator('#mvNote').isVisible());await page.evaluate(()=>App.closeModal());await page.evaluate(()=>App.openItemForm(null));assert.equal(await page.locator('#itTracking').inputValue(),'simple');assert.equal(await page.locator('#itQuantityWrap').isVisible(),false);await page.evaluate(()=>App.closeModal());
  await page.evaluate(()=>App.openItemForm('coffee'));assert.equal(await page.locator('#itTracking').inputValue(),'simple');
  const beforeDuplicateStock=await page.evaluate(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty);
  async function fillReceiptQA(){
   await page.evaluate(()=>{App.closeModal();App.openTicket();});
   await page.locator('#tkDate').fill('2026-10-20');await page.locator('#tkStore').fill('Super QA');
   await page.locator('.tkCost').fill('80');await page.locator('#tkExpectedTotal').fill('80');await page.locator('#tkPayer').selectOption('a');
  }
  await fillReceiptQA();await page.getByRole('button',{name:'Guardar ticket',exact:true}).click();
  await page.waitForFunction(n=>window.__qa.state.items.find(i=>i.id==='rice').currentQty===n,beforeDuplicateStock+1);
  await fillReceiptQA();await page.getByRole('button',{name:'Guardar ticket',exact:true}).click();
  await page.locator('#tkDuplicateWarning').waitFor({state:'visible'});
  assert.ok((await page.locator('#tkDuplicateWarning').innerText()).includes('Posible ticket duplicado'));
  assert.equal(await page.locator('#tkDate').inputValue(),'2026-10-20');assert.equal(await page.locator('.tkCost').inputValue(),'80');
  assert.equal(await page.evaluate(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty),beforeDuplicateStock+1);
  await page.getByRole('button',{name:'Guardar ticket',exact:true}).click();await page.locator('#tkDuplicateWarning').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__qa.state.items.find(i=>i.id==='rice').currentQty),beforeDuplicateStock+1);
  await page.locator('#tkAllowDuplicate').check();await page.getByRole('button',{name:'Guardar ticket',exact:true}).click();
  await page.waitForFunction(n=>window.__qa.state.items.find(i=>i.id==='rice').currentQty===n,beforeDuplicateStock+2);
  await page.evaluate(()=>{App.closeModal();App.openTicket();});assert.equal(await page.locator('.tk-beneficiary').count(),2);assert.equal(await page.locator('.tkDistribution').count(),1);await page.locator('.tkDistribution').selectOption('individual');assert.equal(await page.locator('.tkIndividualWrap').isVisible(),true);await page.locator('.tkDistribution').selectOption('personalizado');assert.equal(await page.locator('.tkCustomPeople').isVisible(),true);await page.locator('.tk-line-beneficiary').first().uncheck();await page.locator('.tkDistribution').selectOption('grupal');await page.locator('#tkKind').selectOption('espontaneo');await page.locator('.tkCost').first().fill('100');await page.evaluate(()=>App.updateTicketTotal());await page.locator('#tkExpectedTotal').fill('90');await page.getByText('Sobran $10.00 en las líneas.',{exact:false}).waitFor();await page.locator('#tkExpectedTotal').fill('100');await page.getByText('La suma de productos coincide con el total pagado.',{exact:true}).waitFor();assert.equal(await page.locator('.tkPack').first().inputValue(),'1');assert.equal(await page.locator('#tkPayer').inputValue(),'');await page.locator('#tkPayer').selectOption('b');assert.equal(await page.locator('.tkCustomPeople').isVisible(),false);await page.evaluate(()=>{App.closeModal();window.__qa.state.bills=[{id:'internet',name:'Internet',nextDueDate:'2026-10-31',cycle:'mensual',history:[]}];App.openPayBill('internet');});assert.ok(await page.getByRole('button',{name:'Guardar recibo',exact:true}).isVisible());assert.equal(await page.locator('#payPayer').count(),0);await page.locator('#receiptAmount').fill('120');await page.getByText('Persona A: $60.00',{exact:true}).waitFor();await page.evaluate(()=>{App.closeModal();window.__qa.state.billReceipts=[{id:'internet-2026-10-31',billId:'internet',amount:120,dueDate:'2026-10-31',participantIds:['a','b'],beneficiaryShares:[{memberId:'a',amount:60},{memberId:'b',amount:60}]}];App.openPayBill('internet');});assert.equal(await page.locator('#payDueDate').inputValue(),'2026-10-31');assert.ok(await page.locator('#payReceiptTotal').isVisible());assert.equal(await page.locator('#payPayer').inputValue(),'');await page.locator('#payPayer').selectOption('b');await page.evaluate(()=>{App.closeModal();App.openBillForm('internet');});assert.equal(await page.locator('#blSplitPolicy').inputValue(),'equal');await page.locator('#blSplitPolicy').selectOption('fixed');assert.ok(await page.locator('#blQuotas').isVisible());await page.evaluate(()=>{App.closeModal();App.go('cuentas');App.setCuentasTab('prestamos');});assert.ok((await page.locator('#main').innerText()).includes('Préstamos privados'));await page.evaluate(()=>{window.__qa.loanFixture();App.setCuentasTab('prestamos');});await page.getByText('Persona B te debe:',{exact:false}).waitFor();await page.evaluate(()=>{window.__qa.state.memberId='b';window.__qa.render();});assert.ok((await page.locator('#mobileTopbar').innerText()).includes('Persona A'));assert.equal(await page.getByText('Elegir quién soy',{exact:true}).count(),0);assert.ok((await page.locator('#main').innerText()).includes('Persona B te debe:'));await page.evaluate(()=>App.openPrivateLoan());assert.ok((await page.locator('#modalRoot').innerText()).includes('Tu cuenta corresponde a Persona A'));await page.evaluate(()=>{App.closeModal();App.setCuentasTab('saldos');window.__qa.state.settlements=[{id:'qa-transfer',fromId:'b',toId:'a',amount:20,date:'2026-10-20'}];App.explainBalance('a');});assert.ok((await page.locator('#modalRoot').innerText()).includes('Tu parte de esos gastos'));assert.ok((await page.locator('#modalRoot').innerText()).includes('-$20.00'));await page.evaluate(()=>{App.closeModal();App.openAccount();});assert.ok((await page.locator('#modalRoot').innerText()).includes('Persona A'));assert.ok(await page.getByRole('button',{name:'Cambiar de cuenta',exact:true}).isVisible());assert.equal(await page.locator('#modalRoot .list-item').count(),0);await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();assert.equal(await page.locator('#passwordCurrent').getAttribute('type'),'password');assert.equal(await page.locator('#passwordNew').getAttribute('autocomplete'),'new-password');await page.locator('#passwordCurrent').fill('Old-fixture-123!');await page.locator('#passwordNew').fill('New-fixture-456!');await page.locator('#passwordConfirm').fill('Different-fixture-789!');await page.evaluate(()=>{window.__pwCalls=[];const user={uid:'qa-a',email:'qa@example.test',async reauthenticateWithCredential(){window.__pwCalls.push('reauth');},async updatePassword(){window.__pwCalls.push('update');}};window.__qa.passwordUser(user);const factory=()=>({currentUser:user});factory.EmailAuthProvider={credential:()=>({})};firebase.auth=factory;});await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await page.getByText('Las contraseñas nuevas no coinciden.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__pwCalls),[]);await page.locator('#passwordConfirm').fill('New-fixture-456!');await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await page.getByText('Contraseña actualizada. Usa la nueva contraseña cuando vuelvas a entrar.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__pwCalls),['reauth','update']);assert.equal(await page.locator('#passwordCurrent').count(),0);await page.setViewportSize({width:1365,height:900});await page.evaluate(()=>App.closeModal());assert.ok((await page.locator('#sidebar').innerText()).includes('Cuenta activa'));await page.evaluate(()=>{
   const q=window.__qa;window.__financeOriginal={members:q.state.members,settings:q.state.settings};
   q.state.members=[{id:'a',name:'Persona A'},{id:'b',name:'Persona B'},{id:'c',name:'Persona C'}];
   q.financeIdentity('a','admin');App.setCuentasTab('plan');App.openFinanceSetup();
  });
  assert.ok(await page.locator('#fpStart').isVisible());assert.equal(await page.locator('.fp-row').count(),3);
  assert.ok(await page.locator('#fpCount').isVisible());assert.ok(await page.locator('#fpEntryLabel').isVisible());assert.ok(await page.locator('#fpEquipmentLabel').isVisible());assert.equal(await page.locator('.fp-include').count(),3);
  assert.ok(!(await page.locator('#modalRoot').innerText()).includes('Lavadora y secadora'));
  await page.locator('#fpEntryLabel').fill('Mudanza compartida');await page.locator('#fpEntryDetail').fill('Depósito y trámites');await page.locator('#fpEquipmentLabel').fill('Muebles');await page.locator('#fpCreditor').selectOption('c');await page.locator('#fpEquipment').fill('600.01');
  assert.equal(await page.locator('.fp-entry-caption').first().innerText(),'Mudanza compartida');assert.equal(await page.locator('.fp-equipment-caption').first().innerText(),'Muebles');
  assert.deepEqual(await page.locator('.fp-equipment-share').allTextContents(),['$200.00','$200.00','$200.01']);
  await page.locator('.fp-entry').nth(0).fill('1000');await page.locator('.fp-entry').nth(1).fill('1100');await page.locator('.fp-entry').nth(2).fill('1200');
  assert.ok((await page.locator('#fpAllocationSummary').innerText()).includes('$3,300.00'));
  assert.ok((await page.locator('.fp-entry-note').nth(2).innerText()).includes('aportación propia'));
  await page.locator('.fp-include').nth(1).uncheck();assert.deepEqual(await page.locator('.fp-equipment-share').allTextContents(),['$300.00','No participa','$300.01']);await page.locator('.fp-include').nth(1).check();

  await page.evaluate(()=>{const q=window.__qa;App.closeModal();q.state.settings={...q.state.settings,financePlan:CasaFinance.create({creditorId:'c',startDate:'2026-10-15',equipmentTotal:600.01,equipmentMonthly:33.33,firstPaid:true,rows:[{memberId:'a',entryTotal:1000,rent:300},{memberId:'b',entryTotal:1100,rent:350},{memberId:'c',entryTotal:1200,rent:400}]},q.state.members)};App.setFinanceMonth('2026-10');});
  assert.ok((await page.locator('#main').innerText()).includes('Mi plan de pagos · Persona A'));
  assert.ok((await page.locator('#main').innerText()).includes('$833.33'));
  await page.evaluate(()=>{window.__qa.financeIdentity('c','member');window.__qa.render();});
  assert.ok((await page.locator('#main').innerText()).includes('Por recuperar'));
  assert.ok((await page.locator('#main').innerText()).includes('Saldo al proveedor: $600.01'));
  assert.equal(await page.getByText('Administrar cuotas de la casa',{exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});
  assert.ok((await page.locator('#main').innerText()).includes('Mi plan de pagos · Persona C'));
  await page.evaluate(source=>{
   const module={exports:{}};new Function('module',source)(module);const q=window.__qa,rows=[{memberId:'a',entryTotal:600,rent:100},{memberId:'b',entryTotal:1200,rent:200},{memberId:'c',entryTotal:1800,rent:300}],plan=CasaFinance.create({rows,creditorId:'c',startDate:'2020-01-15',equipmentTotal:900,equipmentMonthly:50,firstPaid:true},q.state.members);
   const db=module.exports({'settings/config':{cycleStartDay:1,revision:0,financePlan:plan},'bills/rent':{name:'Servicio QA',amountEstimate:600,nextDueDate:'2020-02-15',cycle:'mensual',history:[],paymentIds:[]},'billReceipts/receipt-qa':{billId:'rent',name:'Servicio QA',amount:600,dueDate:'2020-02-15',participantIds:['a','b','c'],beneficiaryShares:[{memberId:'a',amount:100},{memberId:'b',amount:200},{memberId:'c',amount:300}]}}),base=db.runTransaction;
   db.runTransaction=async fn=>{const result=await base(fn);q.monthlyFixture(db);return result;};q.monthlyFixture(db);q.financeIdentity('a','admin');App.go('cuentas');App.setFinanceMonth('2020-02');App.setCuentasTab('plan');App.openMonthlyContribution();
  },fs.readFileSync('tests/fake-db.js','utf8'));
  assert.equal(await page.locator('#mcRent').inputValue(),'100');assert.equal(await page.locator('#mcEntry').inputValue(),'100');assert.equal(await page.locator('#mcEquipment').inputValue(),'50');assert.equal(await page.locator('#mcTotal').inputValue(),'250');
  await page.locator('#mcTotal').fill('249');await page.getByRole('button',{name:'Revisar y registrar aportación',exact:true}).click();await page.getByText('El importe recibido debe coincidir con el desglose',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__qa.state.settings.financePlan.contributions?.length||0),0);
  await page.locator('#mcTotal').fill('250');await page.locator('#mcDate').fill('2020-02-15');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Revisar y registrar aportación',exact:true}).click();await page.locator('#mcMember').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.__qa.state.settings.financePlan.contributions.length),1);
  await page.evaluate(()=>App.go('servicios'));assert.ok((await page.locator('#main').innerText()).includes('Recibido por el responsable: $100.00'));
  const collectedDialog=d=>d.type()==='prompt'?d.accept('2020-02-16'):d.accept();page.on('dialog',collectedDialog);await page.getByRole('button',{name:'Pagar con aportaciones recibidas',exact:true}).click();await page.getByText('Pago al proveedor registrado; aportaciones aplicadas una sola vez',{exact:true}).waitFor();page.off('dialog',collectedDialog);
  assert.equal(await page.evaluate(()=>Object.keys(window.__qa.state.db.snapshot()).filter(k=>k.startsWith('billPayments/')).length),1);assert.equal(await page.getByRole('button',{name:'Pagar con aportaciones recibidas',exact:true}).count(),0);
  await page.evaluate(()=>{const q=window.__qa;Object.assign(q.state,window.__financeOriginal);q.financeIdentity('a','member');App.setCuentasTab('gastos');});
  assert.deepEqual(errors,[]);console.log('Navegación, saldo acumulado y formulario de inventario verificados en escritorio y móvil.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
