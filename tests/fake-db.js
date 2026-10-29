const clone=v=>v==null?v:structuredClone(v);
function fakeDB(seed={}){
 const docs=new Map(Object.entries(seed).map(([k,v])=>[k,{value:clone(v),version:1}]));let failures=0;
 const snapshot=path=>{const entry=docs.get(path);return {id:path.split('/').at(-1),exists:!!entry,data:()=>clone(entry?.value)};};
 const doc=path=>({path,async get(){return snapshot(path);}});
 const query=(name,filters=[])=>({doc:id=>doc(name+'/'+id),where(field,op,value){if(op!=='==')throw Error('Unsupported test query');return query(name,[...filters,{field,value}]);},async get(){return {docs:[...docs].filter(([path,entry])=>path.startsWith(name+'/')&&filters.every(f=>entry.value[f.field]===f.value)).map(([path])=>snapshot(path))};}});
 return {doc,collection:name=>query(name),failNext(){failures++;},snapshot:()=>Object.fromEntries([...docs].map(([path,entry])=>[path,clone(entry.value)])),read:path=>clone(docs.get(path)?.value),
  async runTransaction(fn){
   for(let attempt=0;attempt<20;attempt++){
    const reads=new Map(),writes=[];let wrote=false;
    const result=await fn({async get(ref){if(wrote)throw Error('Read after write');const entry=docs.get(ref.path);reads.set(ref.path,entry?.version||0);await Promise.resolve();return {exists:!!entry,data:()=>clone(entry?.value)};},set(ref,value){wrote=true;writes.push([ref.path,clone(value)]);},delete(ref){wrote=true;writes.push([ref.path,null]);}});
    if([...reads].some(([k,v])=>(docs.get(k)?.version||0)!==v))continue;
    if(failures){failures--;throw Error('Injected commit failure');}
    for(const [path,value]of writes){if(value===null)docs.delete(path);else docs.set(path,{value,version:(docs.get(path)?.version||0)+1});}return result;
   }throw Error('Contention');
  }
 };
}
module.exports=fakeDB;

