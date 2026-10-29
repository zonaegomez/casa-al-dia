function invalid(message,status=400){const e=Error(message);e.status=status;throw e;}
function photo(value){
 if(value===null)return null;
 if(typeof value!=='string'||value.length>45000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))invalid('Usa una foto JPEG reducida a 256 × 256 píxeles');
 const b=Buffer.from(value.slice(23),'base64');if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)invalid('Foto JPEG inválida');
 let width=0,height=0;for(let p=2;p+8<b.length;){if(b[p++]!==255)invalid('Foto JPEG inválida');let mark=b[p++];while(mark===255)mark=b[p++];if(mark===0xda)break;if(mark===0xd8||mark===0xd9)continue;const len=b.readUInt16BE(p);if(len<2||p+len>b.length)invalid('Foto JPEG inválida');if([0xc0,0xc1,0xc2].includes(mark)){height=b.readUInt16BE(p+3);width=b.readUInt16BE(p+5);break;}p+=len;}
 if(width<1||height<1||width>256||height>256)invalid('La foto debe ser una miniatura de hasta 256 × 256 píxeles');return value;
}
async function saveProfile(db,uid,input){const name=String(input.name||'').trim(),color=String(input.color||'');if(!name||name.length>120||!/^#[a-f0-9]{6}$/i.test(color))invalid('Revisa el nombre y el color');const image=photo(input.photoData);return db.runTransaction(async tx=>{const a=await tx.get(db.doc('access/'+uid)),access=a.exists?a.data():null;if(!access?.enabled||!access.memberId)invalid('Cuenta sin perfil vinculado',403);if(input.memberId!==access.memberId)invalid('Solo puedes editar tu propio perfil',403);const mr=db.doc('members/'+access.memberId),ms=await tx.get(mr);if(!ms.exists)invalid('Perfil no disponible',404);const cr=db.doc('settings/config'),cs=await tx.get(cr),c=cs.exists?cs.data():{};tx.set(mr,{...ms.data(),name,color,photoData:image,updatedBy:uid});tx.set(cr,{...c,revision:Number(c.revision||0)+1,updatedBy:uid});return {saved:true};});}
module.exports={saveProfile,photo};
