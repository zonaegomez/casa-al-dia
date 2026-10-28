/* All writes pass through one transaction; never silently fall back to local data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createCasaStore=factory;})(globalThis,function({state,core:C,db:database,actor,ready,newId}){
  const financial=new Set(['movements','bills','debts','settlements','closedCycles','members','billPayments','billReceipts','purchases']);
  const fields={items:['currentQty','minQty'],movements:['qty','unitCost','total'],billPayments:['amount'],billReceipts:['amount'],bills:['amountEstimate'],debts:['totalAmount'],settlements:['amount']};
  function validate(coll,data){
    for(const field of fields[coll]||[])if(data[field]!=null)C.number(data[field],field);
    if(data.startDate)C.date(data.startDate);if(data.dueDate)C.date(data.dueDate);
    if(coll==='settings'){if(data.monthlyBudget!=null)C.number(data.monthlyBudget,'Presupuesto');for(const n of Object.values(data.budgetByCategory||{}))C.number(n,'Presupuesto por categoría');if(!Number.isInteger(data.cycleStartDay)||data.cycleStartDay<1||data.cycleStartDay>28)throw Error('El inicio de ciclo debe ser un día entero de 1 a 28');}
    if(data.date)C.date(data.date);if(data.paidAt)C.date(data.paidAt);if(data.nextDueDate)C.date(data.nextDueDate);
    if(coll==='movements'&&data.splits&&data.splits.length&&data.splits.reduce((s,p)=>s+C.cents(p.amount),0)!==C.cents(data.total))throw Error('Las aportaciones no coinciden con el gasto');
    if(coll==='movements'){
      if(!['compra','consumo'].includes(data.type))throw Error('Tipo de movimiento inválido');
      C.number(data.qty,'Cantidad',true);
      if(data.type==='compra')C.number(data.total,'Monto');
    }
    if(coll==='settlements'&&(!data.fromId||!data.toId||data.fromId===data.toId||!data.allocationDate))throw Error('Transferencia inválida');
    if(coll==='debts'&&(!data.fromId||!data.toId||data.fromId===data.toId))throw Error('Selecciona deudor y acreedor distintos');
    for(const field of ['history','payments'])if(data[field]){
      if(data[field].length>1000)throw Error('Historial demasiado grande. Exporta el respaldo y solicita archivar este registro antes de continuar.');
      for(const p of data[field]){
        C.number(p.amount,'Pago',true);C.date(p.paidAt||p.date);
        if(p.splits&&p.splits.reduce((s,x)=>s+C.cents(x.amount),0)!==C.cents(p.amount))throw Error('Las aportaciones no coinciden con el pago');
      }
    }
    if(coll==='debts'&&(data.payments||[]).reduce((s,p)=>s+C.cents(p.amount),0)>C.cents(data.totalAmount))throw Error('El abono excede el saldo de la deuda');
  }
  async function atomic(meta,handler){
    if(!ready())throw Error('Espera a que la conexión esté sincronizada');
    const db=database(),uid=actor();if(!uid)throw Error('Inicia sesión');
    const id=meta.opId||newId();
    return db.runTransaction(async tx=>{
      const receipt=db.collection('operations').doc(id);const oldReceipt=await tx.get(receipt);
      if(oldReceipt.exists)return oldReceipt.data().result;
      const configRef=db.doc('settings/config');const configSnap=await tx.get(configRef);const config=configSnap.exists?configSnap.data():{cycleStartDay:1,currency:'MXN',householdName:'Mi Casa'};
      if(meta.expectedRevision!==undefined&&Number(config.revision||0)!==meta.expectedRevision){const e=Error('El historial cambió mientras revisabas el ticket. Pulsa Guardar otra vez para comprobar duplicados.');e.code='LEDGER_CHANGED';throw e;}
      const cache=new Map([['settings/config',config]]),writes=new Map(),before=new Map();
      const dates=new Set(meta.dates||[]);let touchesFinancial=false;
      async function get(coll,key){const path=coll+'/'+key;if(cache.has(path))return cache.get(path);const snap=await tx.get(db.doc(path));const value=snap.exists?snap.data():null;cache.set(path,value);return value;}
      async function put(coll,key,patch,merge=true){
        if(!key||key.includes('/'))throw Error('Identificador inválido');
        const prev=await get(coll,key);if(!before.has(coll+'/'+key))before.set(coll+'/'+key,prev);const data=merge?Object.assign({},prev||{},patch):Object.assign({},patch);
        validate(coll,data);
        if(coll==='settings'&&prev&&data.cycleStartDay!==prev.cycleStartDay)throw Error('El día de ciclo no puede cambiar sobre un historial existente');
        if(financial.has(coll))touchesFinancial=true;
        if(coll==='billReceipts'){if(prev?.dueDate)dates.add(prev.dueDate);dates.add(data.dueDate);C.number(data.amount,'Total del recibo',true);if(prev&&JSON.stringify(prev)!==JSON.stringify(data))throw Error('El recibo confirmado conserva su importe y reparto; concilia una corrección antes de cambiarlo');}
        if(coll==='billPayments'){if(data.receiptId){const r=await get('billReceipts',data.receiptId);if(!r||r.billId!==data.billId||r.dueDate!==data.dueDate)throw Error('Recibo de origen inválido');dates.add(r.dueDate);}if(prev?.paidAt)dates.add(prev.paidAt);dates.add(data.paidAt);if(data.splits&&data.splits.reduce((s,p)=>s+C.cents(p.amount),0)!==C.cents(data.amount))throw Error('Las aportaciones no coinciden');C.number(data.amount,'Pago',true);}
        if(coll==='movements'&&data.splits&&data.splits.length&&data.splits.reduce((s,p)=>s+C.cents(p.amount),0)!==C.cents(data.total))throw Error('Las aportaciones no coinciden con el gasto');
    if(coll==='purchases'){if(prev?.date)dates.add(prev.date);dates.add(data.date);}
        if(coll==='movements'){if(prev?.date)dates.add(prev.date);dates.add(data.date);}
        if(coll==='settlements'){if(prev?.allocationDate)dates.add(prev.allocationDate);dates.add(data.allocationDate);}
        if(coll==='bills'){
          const old=new Map((prev?.history||[]).map((p,i)=>[p.id||'legacy-'+i,JSON.stringify(p)]));
          (data.history||[]).forEach((p,i)=>{if(old.get(p.id||'legacy-'+i)!==JSON.stringify(p))dates.add(p.paidAt);});
          const next=new Map((data.history||[]).map((p,i)=>[p.id||'legacy-'+i,JSON.stringify(p)]));
          (prev?.history||[]).forEach((p,i)=>{if(next.get(p.id||'legacy-'+i)!==JSON.stringify(p))dates.add(p.paidAt);});
        }
        cache.set(coll+'/'+key,data);writes.set(coll+'/'+key,{data:Object.assign(data,{updatedBy:uid}),remove:false});return data;
      }
      async function remove(coll,key){
        const prev=await get(coll,key);if(!prev)return;
        if(coll==='members'||coll==='bills'||coll==='debts'||coll==='items')throw Error('Este registro se archiva para conservar sus referencias');
        if(coll==='movements')dates.add(prev.date);
        if(coll==='settlements')dates.add(prev.allocationDate||prev.date);
        if(financial.has(coll))touchesFinancial=true;
        writes.set(coll+'/'+key,{remove:true});
      }
      const result=(await handler({get,put,remove,config,id}))??null;
      for(const day of dates){C.date(day);const closed=await get('closedCycles',C.cycle(day,config.cycleStartDay||1));if(closed)throw Error('El ciclo de '+day+' está cerrado');}
      if(touchesFinancial){
        const latest=cache.get('settings/config')||config;
        writes.set('settings/config',{data:Object.assign({},latest,{revision:Number(config.revision||0)+1,legacyParticipantIds:config.legacyParticipantIds||C.participants(state.members),schemaVersion:2,updatedBy:uid})});
      }
      for(const [path,w]of writes){if(path.startsWith('debts/')&&!w.remove){const prev=before.get(path);if(prev?.originPurchaseId&&['totalAmount','fromId','toId','startDate','voided','archived'].some(k=>w.data[k]!==prev[k])&&!writes.has('purchases/'+prev.originPurchaseId))throw Error('La deuda vinculada se corrige desde su compra de origen');}}
      if(writes.size>240)throw Error('Operación demasiado grande; reduce los productos o beneficiarios');
      for(const [path,w]of writes){if(w.remove)tx.delete(db.doc(path));else tx.set(db.doc(path),w.data);}
      tx.set(receipt,{kind:meta.kind||'write',actorUid:uid,createdAt:new Date().toISOString(),paths:[...writes.keys()],changes:[...writes].map(([path,w])=>({path,removed:!!w.remove,...(!w.remove?{amount:w.data.total??w.data.amount??null,quantity:w.data.currentQty??null,beforeAmount:before.get(path)?.total??before.get(path)?.amount??null,beforeQuantity:before.get(path)?.currentQty??null}:{} )})),result});
      return result;
    });
  }
  async function add(coll,data,meta={}){const id=newId();return atomic(meta,async t=>{await t.put(coll,id,data,false);return id;});}
  async function set(coll,id,data,merge=true){return atomic({},t=>t.put(coll,id,data,merge).then(()=>null));}
  async function del(coll,id){return atomic({},t=>t.remove(coll,id));}
  async function ticketCandidates(date,operationId){
    if(!ready()||!actor())throw Error('Espera a que la conexión esté sincronizada');
    C.date(date);const db=database();
    if(operationId){const op=await db.doc('operations/'+operationId).get({source:'server'});if(op.exists)return {operation:{result:op.data().result}};}
    const config=await db.doc('settings/config').get({source:'server'});
    const revision=Number(config.exists?config.data().revision||0:0);
    const [headers,lines]=await Promise.all([
      db.collection('purchases').where('date','==',date).get({source:'server'}),
      db.collection('movements').where('date','==',date).get({source:'server'})
    ]);
    const rows=snap=>snap.docs.map(d=>({...d.data(),id:d.id}));
    return {revision,purchases:rows(headers),movements:rows(lines)};
  }
  return {atomic,add,set,del,ticketCandidates,setSettings:(data,merge)=>set('settings','config',data,merge)};
});
