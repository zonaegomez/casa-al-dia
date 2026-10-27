(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createPurchaseService=factory;})(globalThis,function({store,C,members}){
 function plan(input){
  const total=input.lines.reduce((s,l)=>s+C.cents(l.total),0)/100;
  const people=members(),ids=input.participantIds;if(!['normal','dividido','deuda'].includes(input.mode||'normal'))throw Error('Modo de pago inválido');
  if(!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!people.some(m=>m.id===id&&m.active!==false)))throw Error('Selecciona beneficiarios activos válidos (máximo 20)');
  if(input.lines.length<1||input.lines.length>100)throw Error('El ticket debe contener entre 1 y 100 productos');
  const payers=input.payers.map(p=>({...p,amount:C.money(p.amount)}));
  if(!payers.length||new Set(payers.map(p=>p.memberId)).size!==payers.length||payers.some(p=>!people.some(m=>m.id===p.memberId)))throw Error('Pagadores inválidos');
  if(payers.reduce((s,p)=>s+C.cents(p.amount),0)!==C.cents(total))throw Error('Las aportaciones no coinciden con el total del gasto');
  let shares=C.allocate(total,ids).map(s=>({memberId:s.memberId,amount:s.cents/100}));
  if(input.mode==='deuda'){
   if(payers.length!==1)throw Error('Un adelanto requiere un solo pagador');
   const debts=input.debtorShares||[],payer=payers[0].memberId;
   if(new Set(debts.map(d=>d.memberId)).size!==debts.length||debts.some(d=>d.memberId===payer||!ids.includes(d.memberId)))throw Error('Los deudores deben ser beneficiarios distintos del pagador');
   const owed=debts.reduce((s,d)=>s+C.cents(d.amount),0);if(owed>C.cents(total))throw Error('La deuda no puede exceder el gasto');if(!ids.includes(payer)&&owed!==C.cents(total))throw Error('Asigna todo el gasto a los beneficiarios cuando el pagador no participa');
   shares=ids.map(memberId=>({memberId,amount:memberId===payer?(C.cents(total)-owed)/100:(debts.find(d=>d.memberId===memberId)?.amount||0)}));
  }
  const lineShares=input.lines.map(l=>{
   const selected=l.participantIds||ids;
   if(!selected.length||new Set(selected).size!==selected.length||selected.some(id=>!people.some(m=>m.id===id&&m.active!==false)))throw Error('Selecciona participantes válidos en cada producto');
   if(input.mode==='deuda'&&l.participantIds&&JSON.stringify([...selected].sort())!==JSON.stringify([...ids].sort()))throw Error('Para productos con distintos participantes usa el saldo compartido; no una deuda separada');
   return input.mode==='deuda'?null:C.allocate(l.total,selected).map(p=>({memberId:p.memberId,amount:p.cents/100}));
  });
  if(input.mode!=='deuda'){
   const totals=new Map();lineShares.flat().forEach(p=>totals.set(p.memberId,(totals.get(p.memberId)||0)+C.cents(p.amount)));
   shares=[...totals].map(([memberId,n])=>({memberId,amount:n/100}));
  }
  return {total,payers,shares,lineShares};
 }
 async function write(t,header,lines,old=null){
  const amounts=lines.map(l=>l.total),paid=C.matrix(header.payers,amounts),owed=C.matrix(header.beneficiaryShares,amounts);
  for(let i=0;i<lines.length;i++){
   const l=lines[i];C.number(l.qty,'Cantidad',true);C.number(l.total,'Costo');C.date(l.date||header.date);
   if(l.itemId&&!l.itemName)throw Error('Falta el nombre del artículo');
   await t.put('movements',l.id,{...l,date:header.date,total:C.money(l.total),unitCost:l.total/l.qty,purchaseId:header.id,ticketGroupId:header.id,ticketConcept:header.concept||'Ticket de compra',ticketKind:header.kind||'despensa',splits:paid[i],memberId:header.payers.length===1?header.payers[0].memberId:null,memberName:header.payers.length===1?header.payers[0].memberName:'Varios integrantes',participantIds:l.participantIds||header.participantIds,beneficiaryShares:header.mode==='deuda'?owed[i]:(l.beneficiaryShares||owed[i]),debtFronted:header.mode==='deuda'},false);
  }
  const debtIds=[];
  if(header.mode==='deuda'){
   for(const share of header.beneficiaryShares.filter(s=>s.memberId!==header.payers[0].memberId&&s.amount>0)){
    const id=header.id+'-debt-'+share.memberId,prev=await t.get('debts',id);
    if((prev?.payments||[]).length)throw Error('Este adelanto ya tiene abonos. No se modifica el gasto original; concilia una corrección separada.');
    await t.put('debts',id,{name:header.concept||'Adelanto de compra',fromId:share.memberId,fromName:members().find(m=>m.id===share.memberId)?.name||'Integrante',toId:header.payers[0].memberId,toName:header.payers[0].memberName,totalAmount:share.amount,startDate:header.date,payments:[],originPurchaseId:header.id,voided:false},false);debtIds.push(id);
   }
  }
  for(const id of old?.debtIds||[])if(!debtIds.includes(id)){const d=await t.get('debts',id);if(d?.payments?.length)throw Error('El adelanto tiene abonos');await t.put('debts',id,{voided:true});}
  await t.put('purchases',header.id,{...header,debtIds,lineIds:lines.map(l=>l.id)},false);
 }
 async function create(input,meta){
  C.date(input.date);const allocation=plan(input);
  return store.atomic(meta,async t=>{
   const lines=[];
   for(let i=0;i<input.lines.length;i++){
    const l=input.lines[i];C.number(l.qty,'Cantidad',true);let item=null;
    if(l.itemId){item=await t.get('items',l.itemId);if(!item||item.archived)throw Error('Artículo no disponible');const exact=item.trackingMode!=='simple';await t.put('items',l.itemId,{currentQty:exact?C.quantity(item.currentQty,l.qty):item.currentQty,stockStatus:'hay',shoppingFlag:false,shoppingFlagBy:null,shoppingFlagAt:null,updatedAt:input.date});}
    const itemName=item?item.name:l.itemName;if(!itemName)throw Error('Completa el nombre del producto');
    lines.push({...(allocation.lineShares[i]?{participantIds:allocation.lineShares[i].map(p=>p.memberId),beneficiaryShares:allocation.lineShares[i]}:{}),id:t.id+'-'+i,itemId:l.itemId||null,itemName,category:item?item.category:l.category,unit:item?.unit||'',inventoryTracked:!!item&&item.trackingMode!=='simple',qty:l.qty,total:l.total,type:'compra',store:input.store||'',note:input.note||'',date:input.date});
   }
   const header={id:t.id,date:input.date,store:input.store||'',concept:input.concept||'Compra',kind:input.kind||'despensa',mode:input.mode||'normal',participantIds:allocation.shares.map(p=>p.memberId),payers:allocation.payers,beneficiaryShares:allocation.shares,total:allocation.total};
   await write(t,header,lines);return t.id;
  });
 }
 async function edit(id,patch,meta){
  return store.atomic(meta,async t=>{
   const target=await t.get('movements',id);if(!target||target.voided)throw Error('Movimiento no disponible');
   const header=target.purchaseId?await t.get('purchases',target.purchaseId):null;
   if(!header){
    if(target.debtFronted)throw Error('Adelanto antiguo sin vínculo verificable. Concilia sus deudas antes de modificarlo.');
    const total=C.money(patch.total),oldPaid=target.splits?.length?target.splits:[{memberId:target.memberId,memberName:target.memberName,amount:target.total}];
    const paid=C.proportional(C.cents(total),oldPaid.map(p=>C.cents(p.amount))).map((n,i)=>({...oldPaid[i],amount:n/100}));
    if(paid.length===1&&patch.memberId)paid[0]={...paid[0],memberId:patch.memberId,memberName:patch.memberName};
    const ids=target.participantIds||t.config.legacyParticipantIds;if(!ids?.length)throw Error('Falta acordar el reparto histórico');
    await t.put('movements',id,{...patch,total,unitCost:total/target.qty,splits:paid,memberId:paid.length===1?paid[0].memberId:null,memberName:paid.length===1?paid[0].memberName||'Integrante':'Varios integrantes',participantIds:ids});return;
   }
   if(header.voided)throw Error('Compra anulada');const lines=[];
   for(const lineId of header.lineIds){const line=await t.get('movements',lineId);if(!line||line.voided)throw Error('La compra requiere conciliación por líneas faltantes');lines.push({...line,id:lineId,...(lineId===id?patch:{})});}
   const total=lines.reduce((s,l)=>s+C.cents(l.total),0)/100;
   const payers=C.proportional(C.cents(total),header.payers.map(p=>C.cents(p.amount))).map((n,i)=>({...header.payers[i],amount:n/100}));
   if(payers.length===1&&patch.memberId&&patch.memberId!==payers[0].memberId){if(header.mode==='deuda')throw Error('No se cambia el acreedor de un adelanto');payers[0]={memberId:patch.memberId,memberName:patch.memberName,amount:total};}
   if(header.mode!=='deuda')for(const line of lines){line.participantIds=line.participantIds||header.participantIds;line.beneficiaryShares=C.allocate(line.total,line.participantIds).map(p=>({memberId:p.memberId,amount:p.cents/100}));}
   let shares=C.proportional(C.cents(total),header.beneficiaryShares.map(p=>C.cents(p.amount))).map((n,i)=>({...header.beneficiaryShares[i],amount:n/100}));
   if(header.mode!=='deuda'){const totals=new Map();lines.flatMap(l=>l.beneficiaryShares).forEach(p=>totals.set(p.memberId,(totals.get(p.memberId)||0)+C.cents(p.amount)));shares=[...totals].map(([memberId,n])=>({memberId,amount:n/100}));}
   await write(t,{...header,total,payers,beneficiaryShares:shares,date:patch.date||header.date},lines,header);
  });
 }
 async function voidPurchase(id,meta){
  return store.atomic(meta,async t=>{
   const target=await t.get('movements',id);if(!target||target.voided)return;
   const header=target.purchaseId?await t.get('purchases',target.purchaseId):null;
   if(target.debtFronted&&!header)throw Error('Adelanto antiguo sin vínculo. Requiere conciliación antes de anularlo.');
   const ids=header?header.lineIds:[id];
   for(const debtId of header?.debtIds||[]){const d=await t.get('debts',debtId);if(d?.payments?.length)throw Error('No se anula un adelanto con abonos. Concilia primero los pagos.');await t.put('debts',debtId,{voided:true});}
   for(const lineId of ids){const m=await t.get('movements',lineId);if(!m||m.voided)continue;if(m.itemId&&m.inventoryTracked!==false){const it=await t.get('items',m.itemId);if(!it)throw Error('Falta el artículo');await t.put('items',m.itemId,{currentQty:C.quantity(it.currentQty,m.type==='consumo'?m.qty:-m.qty)});}await t.put('movements',lineId,{voided:true});}
   if(header)await t.put('purchases',header.id,{voided:true});
  });
 }
 return {create,edit,voidPurchase,plan};
});
