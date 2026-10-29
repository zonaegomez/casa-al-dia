(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createInventoryService=factory;})(globalThis,function({store,C,members}){
 function person(id){const p=members().find(m=>m.id===id&&m.active!==false);if(!p)throw Error('Tu cuenta necesita un integrante activo');return p;}
 async function consume(input,meta){
  const p=person(input.memberId),qty=C.number(input.qty,'Cantidad',true),date=C.date(input.date||C.today());
  return store.atomic(meta,async t=>{
   const item=await t.get('items',input.itemId);if(!item||item.archived)throw Error('Artículo no disponible');
   if(item.trackingMode==='simple')throw Error('Este artículo usa estados. Marca Hay, Queda poco o Se acabó.');
   const remaining=C.quantity(item.currentQty,-qty);
   await t.put('items',input.itemId,{currentQty:remaining,updatedAt:date,stockActionId:null,...(remaining<=Number(item.minQty||0)?{shoppingSnoozedUntil:null}:{})});
   await t.put('movements',t.id,{itemId:input.itemId,itemName:item.name,category:item.category,type:'consumo',qty,inventoryTracked:true,unit:item.unit||'',unitCost:0,total:0,date,memberId:p.id,memberName:p.name,note:input.note||'',store:'',participantIds:C.participants(members())},false);
   return {kind:'consume',id:t.id,itemId:input.itemId,name:item.name,qty,remaining,unit:item.unit||''};
  });
 }
 async function setStatus(itemId,status,meta){
  if(!['hay','poco','comprar'].includes(status))throw Error('Estado no válido');
  return store.atomic(meta,async t=>{
   const item=await t.get('items',itemId);if(!item||item.archived)throw Error('Artículo no disponible');
   if(item.trackingMode!=='simple')throw Error('Este artículo usa cantidad exacta. Cambia su control desde Editar si prefieres estados.');
   if(item.stockStatus===status&&!item.shoppingSnoozedUntil&&!!item.shoppingFlag===(status!=='hay'))return null;
   const previous={stockStatus:item.stockStatus||'hay',shoppingFlag:!!item.shoppingFlag,shoppingFlagBy:item.shoppingFlagBy||null,shoppingFlagAt:item.shoppingFlagAt||null,shoppingSnoozedUntil:item.shoppingSnoozedUntil||null};
   await t.put('items',itemId,{stockStatus:status,stockActionId:t.id,shoppingFlag:status!=='hay',shoppingFlagBy:null,shoppingFlagAt:status!=='hay'?C.today():null,shoppingSnoozedUntil:null,updatedAt:C.today()});
   return {kind:'status',id:t.id,itemId,name:item.name,status,previous};
  });
 }
 async function undo(action,meta){
  if(!action||!['consume','status'].includes(action.kind))throw Error('Acción no disponible');
  return store.atomic(meta,async t=>{
   const item=await t.get('items',action.itemId);if(!item||item.archived)throw Error('Artículo no disponible');
   if(action.kind==='consume'){
    const m=await t.get('movements',action.id);if(!m||m.voided)return;
    if(m.type!=='consumo'||m.itemId!==action.itemId||!m.inventoryTracked||item.trackingMode==='simple'||(item.unit||'')!==m.unit)throw Error('El control o la unidad cambió. Revisa el artículo antes de corregirlo.');
    await t.put('items',action.itemId,{currentQty:C.quantity(item.currentQty,m.qty),stockActionId:null,updatedAt:C.today()});
    await t.put('movements',action.id,{voided:true});
   }else{
    if(item.trackingMode!=='simple'||item.stockActionId!==action.id||item.stockStatus!==action.status)throw Error('El artículo cambió después. Revisa su estado actual antes de corregirlo.');
    await t.put('items',action.itemId,{...action.previous,stockActionId:null,updatedAt:C.today()});
   }
  });
 }
 return {consume,setStatus,undo};
});
