const zlib=require('node:zlib');
function crc(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,b){const name=Buffer.from(type),out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);name.copy(out,4);b.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,b])),8+b.length);return out;}
// Vector geometry matches the house/check mark used in the app shell.
const paths=[[[24,44],[50,22],[76,44],[76,76],[24,76],[24,44]],[[38,52],[47,61],[63,44]]];
function distance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
module.exports=size=>{
 const pixels=Buffer.alloc((size*4+1)*size),samples=4;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let covered=0;for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
   const a=(x+(sx+.5)/samples)*100/size,b=(y+(sy+.5)/samples)*100/size;
   if(paths.some(path=>path.slice(1).some((point,i)=>distance(a,b,path[i],point)<=4)))covered++;
  }
  const mix=covered/(samples*samples),p=y*(size*4+1)+1+x*4;
  [98,88,232].forEach((v,i)=>pixels[p+i]=Math.round(v+(255-v)*mix));pixels[p+3]=255;
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
};
