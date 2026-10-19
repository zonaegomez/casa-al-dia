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
    for(const row of rows){
      const amount=cents(row.amount);
      const ids=row.participantIds;
      const payers=row.payers || [{memberId:row.memberId,amount:row.amount}];
      if(!ids?.length || ids.some(id=>!map.has(id)) || payers.some(p=>!map.has(p.memberId)) || payers.reduce((s,p)=>s+cents(p.amount),0)!==amount){unassigned+=amount; continue;}
      total+=amount;
      allocate(row.amount,ids).forEach(s=>map.get(s.memberId).owed+=s.cents);
      payers.forEach(p=>map.get(p.memberId).paid+=cents(p.amount));
    }
    const adjustments=new Map();
    for(const s of settlements){
      if(!map.has(s.fromId)||!map.has(s.toId)||s.fromId===s.toId) continue;
      const n=cents(s.amount);adjustments.set(s.fromId,(adjustments.get(s.fromId)||0)+n);adjustments.set(s.toId,(adjustments.get(s.toId)||0)-n);
    }
    const result=[...map.values()].map(x=>({member:x.member,paid:x.paid/100,fairShare:x.owed/100,balance:(x.paid-x.owed+(adjustments.get(x.member.id)||0))/100}));
    const creditors=result.filter(x=>x.balance>0).map(x=>({id:x.member.id,name:x.member.name,amt:Math.round(x.balance*100)}));
    const debtors=result.filter(x=>x.balance<0).map(x=>({id:x.member.id,name:x.member.name,amt:-Math.round(x.balance*100)}));
    const transfers=[];let c=0,d=0;
    while(c<creditors.length&&d<debtors.length){const cr=creditors[c],de=debtors[d],n=Math.min(cr.amt,de.amt);transfers.push({fromId:de.id,from:de.name,toId:cr.id,to:cr.name,amount:n/100});cr.amt-=n;de.amt-=n;if(!cr.amt)c++;if(!de.amt)d++;}
    return {total:total/100,unassigned:unassigned/100,fairShare:0,balances:result,transfers,settlements};
  }
  function quantity(current, delta){ const n=Number(current)+Number(delta); if(!Number.isFinite(n)||n<0) throw Error('La operación dejaría inventario negativo'); return Math.round(n*1e6)/1e6; }
  return {number,cents,money,date,today,cycle,participants,allocate,balances,quantity};
});
