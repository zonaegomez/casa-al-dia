const {Timestamp,GeoPoint}=require('firebase-admin/firestore');
function encode(v){
 if(v instanceof Timestamp)return {__casaType:'Timestamp',seconds:v.seconds,nanoseconds:v.nanoseconds};
 if(v instanceof GeoPoint)return {__casaType:'GeoPoint',latitude:v.latitude,longitude:v.longitude};
 if(v instanceof Date)return {__casaType:'Date',iso:v.toISOString()};
 if(Buffer.isBuffer(v))return {__casaType:'Bytes',base64:v.toString('base64')};
 if(Array.isArray(v))return v.map(encode);
 if(v&&typeof v==='object'){if(v.path&&v.firestore)throw Error('El respaldo requiere soporte específico para referencias de documentos');return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));}
 return v;
}
function decode(v){
 if(Array.isArray(v))return v.map(decode);
 if(v&&typeof v==='object'){
  if(v.__casaType==='Timestamp')return new Timestamp(v.seconds,v.nanoseconds);
  if(v.__casaType==='GeoPoint')return new GeoPoint(v.latitude,v.longitude);
  if(v.__casaType==='Date')return new Date(v.iso);
  if(v.__casaType==='Bytes')return Buffer.from(v.base64,'base64');
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));
 }
 return v;
}
module.exports={encode,decode};
