const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
if(nodeMajor!==24||nodeMinor<15)throw Error('Usa Node 24.15 o posterior dentro de la rama 24.x; las dependencias no soportan Node 22.');
const fs=require('node:fs');const vm=require('node:vm');
for(const file of ['sw.js','core.js','store.js','purchase-service.js','bill-service.js','inventory-service.js','finance-plans.js','monthly-service.js',...['api','server','scripts'].flatMap(dir=>fs.readdirSync(dir).filter(x=>x.endsWith('.js')).map(x=>dir+'/'+x))])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
const html=fs.readFileSync('index.html','utf8');let i=0;
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())new vm.Script(match[1],{filename:'inline-'+(++i)});}
console.log('Sintaxis válida: scripts externos e inline');


