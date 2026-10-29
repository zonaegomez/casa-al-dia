/* Shared, deterministic business rules. Browser + Node, no external dependencies. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.CasaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  function number(value, label, positive=false){
    const n = Number(value);
    if(!Number.isFinite(n) || n < 0 || (positive && n <= 0)) throw Error(label+' debe ser un número '+(positive?'mayor a cero':'no negativo'));
    return n;
  }
  function cents(value){ return Math.round(number(value,'Monto') * 100); }
  function money(value){ return cents(value)/100; }
  function date(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) throw Error('Fecha inválida');
    return value;
  }
  function today(now=new Date()){
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get = t=>p.find(x=>x.type===t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function cycle(iso, start=1){
    date(iso); const d = new Date(iso+'T12:00:00Z');
    if(d.getUTCDate()<start) d.setUTCMonth(d.getUTCMonth()-1,1);
    return d.toISOString().slice(0,7);
  }
  function participants(members){ return members.filter(m=>m.active!==false).map(m=>m.id).sort(); }
  function allocate(amount, ids){
    ids = [...new Set(ids)].sort(); if(!ids.length) throw Error('Selecciona al menos un beneficiario');
    const total=cents(amount), base=Math.floor(total/ids.length), remainder=total%ids.length;
    return ids.map((memberId,i)=>({memberId, cents:base+(i<remainder?1:0)}));
  }
  function balances(rows, members, settlements){
    const map=new Map(members.map(m=>[m.id,{member:m,paid:0,owed:0}]));
    let total=0, unassigned=0;
    const pairs=new Map();
    function addPair(from,to,n){
      if(!n||from===to)return;
      const ids=[from,to].sort(),key=JSON.stringify(ids);
      const pair=pairs.get(key)||{ids,n:0};pair.n+=from===ids[0]?n:-n;pairs.set(key,pair);
    }
    for(const row of rows){
      if(row.debtFronted)continue;
      const amount=cents(row.amount);
      const ids=row.participantIds;
      const payers=row.allowPartial?(row.payers||[]):(row.payers?.length?row.payers: [{memberId:row.memberId,amount:row.amount}]);
      if(!ids?.length || new Set(ids).size!==ids.length || ids.some(id=>!map.has(id)) || payers.some(p=>!map.has(p.memberId)) || (row.allowPartial?payers.reduce((s,p)=>s+cents(p.amount),0)>amount:payers.reduce((s,p)=>s+cents(p.amount),0)!==amount)){unassigned+=amount; continue;}
      total+=amount;
      const shares=row.beneficiaryShares?row.beneficiaryShares.map(s=>({memberId:s.memberId,cents:cents(s.amount)})):allocate(row.amount,ids);
      if(shares.reduce((s,p)=>s+p.cents,0)!==amount||shares.length!==ids.length||new Set(shares.map(s=>s.memberId)).size!==ids.length||shares.some(s=>!ids.includes(s.memberId))){total-=amount;unassigned+=amount;continue;}
      // First apply each payer's own share. Only money fronted for others creates a debt.
      const remaining=new Map(shares.map(s=>[s.memberId,s.cents]));
      const funding=new Map();payers.forEach(p=>funding.set(p.memberId,(funding.get(p.memberId)||0)+cents(p.amount)));
      for(const [id,n] of funding){const own=Math.min(n,remaining.get(id)||0);funding.set(id,n-own);remaining.set(id,(remaining.get(id)||0)-own);}
      for(const [payer,n] of [...funding].sort(([a],[b])=>a.localeCompare(b))){
        if(!n)continue;
        const recipients=[...remaining].sort(([a],[b])=>a.localeCompare(b));
        const parts=proportional(n,recipients.map(([,v])=>v));
        recipients.forEach(([id,v],i)=>{addPair(id,payer,parts[i]);remaining.set(id,v-parts[i]);});
      }
      shares.forEach(s=>map.get(s.memberId).owed+=s.cents);
      payers.forEach(p=>map.get(p.memberId).paid+=cents(p.amount));
    }
    const adjustments=new Map();
    for(const s of settlements){
      if(s.voided||s.archived||!map.has(s.fromId)||!map.has(s.toId)||s.fromId===s.toId) continue;
      const n=cents(s.amount);addPair(s.fromId,s.toId,-n);adjustments.set(s.fromId,(adjustments.get(s.fromId)||0)+n);adjustments.set(s.toId,(adjustments.get(s.toId)||0)-n);
    }
    const result=[...map.values()].map(x=>({member:x.member,paid:x.paid/100,fairShare:x.owed/100,balance:(x.paid-x.owed+(adjustments.get(x.member.id)||0))/100}));
    const creditors=result.filter(x=>x.balance>0).map(x=>({id:x.member.id,name:x.member.name,amt:Math.round(x.balance*100)}));
    const debtors=result.filter(x=>x.balance<0).map(x=>({id:x.member.id,name:x.member.name,amt:-Math.round(x.balance*100)}));
    const transfers=[];let c=0,d=0;
    while(c<creditors.length&&d<debtors.length){const cr=creditors[c],de=debtors[d],n=Math.min(cr.amt,de.amt);transfers.push({fromId:de.id,from:de.name,toId:cr.id,to:cr.name,amount:n/100});cr.amt-=n;de.amt-=n;if(!cr.amt)c++;if(!de.amt)d++;}
    const directTransfers=[...pairs.values()].filter(p=>p.n).map(p=>{const [fromId,toId]=p.n>0?p.ids:[...p.ids].reverse();return {fromId,from:map.get(fromId).member.name,toId,to:map.get(toId).member.name,amount:Math.abs(p.n)/100};});
    return {directTransfers,total:total/100,unassigned:unassigned/100,fairShare:0,balances:result,transfers,settlements};
  }
  function billShares(bill,amount,ids){
    if(bill.splitPolicy!=='fixed')return allocate(amount,ids).map(p=>({memberId:p.memberId,amount:p.cents/100}));
    const shares=bill.fixedShares||[];
    if(!shares.length||new Set(shares.map(p=>p.memberId)).size!==shares.length||shares.some(p=>!ids.includes(p.memberId))||shares.reduce((s,p)=>s+cents(p.amount),0)!==cents(amount))throw Error('Las cuotas deben sumar el total del recibo y corresponder a sus integrantes');
    return shares.map(p=>({memberId:p.memberId,amount:money(p.amount)}));
  }
  function receiptProgress(receipt,payments){
    const paid=new Map();for(const p of payments.filter(p=>!p.voided&&p.receiptId===receipt.id)){for(const x of p.splits?.length?p.splits:[{memberId:p.memberId,amount:p.amount}])paid.set(x.memberId,(paid.get(x.memberId)||0)+cents(x.amount));}
    const totalPaid=[...paid.values()].reduce((s,n)=>s+n,0);
    return {paid:totalPaid/100,pending:Math.max(0,cents(receipt.amount)-totalPaid)/100,payers:[...paid].map(([memberId,n])=>({memberId,amount:n/100})),members:receipt.beneficiaryShares.map(s=>{const contributed=paid.get(s.memberId)||0,owed=cents(s.amount);return {memberId:s.memberId,owed:owed/100,paid:contributed/100,pending:Math.max(0,owed-contributed)/100,credit:Math.max(0,contributed-owed)/100,percent:owed?Math.min(100,contributed/owed*100):100};})};
  }
  function quantity(current, delta){ const n=Number(current)+Number(delta); if(!Number.isFinite(n)||n<0) throw Error('La operación dejaría inventario negativo'); return Math.round(n*1e6)/1e6; }
  function proportional(total,weights){
    if(!Number.isSafeInteger(total)||total<0||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw Error('Reparto inválido');
    const sum=weights.reduce((s,n)=>s+n,0);if(!sum){if(total)throw Error('Faltan proporciones');return weights.map(()=>0);}
    const parts=weights.map((n,i)=>{const product=BigInt(total)*BigInt(n);return {i,n:Number(product/BigInt(sum)),rem:product%BigInt(sum)};});
    let rest=total-parts.reduce((s,p)=>s+p.n,0);const sorted=[...parts].sort((a,b)=>a.rem===b.rem?a.i-b.i:a.rem>b.rem?-1:1);
    for(let i=0;i<rest;i++)sorted[i].n++;return parts.map(p=>p.n);
  }
  function matrix(shares,amounts){
    if(shares.reduce((s,p)=>s+cents(p.amount),0)!==amounts.reduce((s,n)=>s+cents(n),0))throw Error('Las aportaciones no coinciden con el gasto');
    let remaining=amounts.map(cents);const columns=amounts.map(()=>[]);
    for(const share of shares){const parts=proportional(cents(share.amount),remaining);parts.forEach((n,i)=>{columns[i].push({memberId:share.memberId,memberName:share.memberName||'',amount:n/100});remaining[i]-=n;});}
    return columns;
  }
  return {billShares,receiptProgress,proportional,matrix,number,cents,money,date,today,cycle,participants,allocate,balances,quantity};
});
