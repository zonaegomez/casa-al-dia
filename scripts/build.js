const fs=require('node:fs');
const value=process.env.CASA_FIREBASE_WEB_CONFIG;
if(process.env.VERCEL&&!value)throw Error('Configura CASA_FIREBASE_WEB_CONFIG para este entorno de Vercel antes de desplegar.');
let config=null;
if(value){const parsed=JSON.parse(value);if(!parsed.apiKey||!parsed.projectId||!parsed.authDomain)throw Error('Configuración pública de Firebase incompleta');config={};for(const key of ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'])if(parsed[key])config[key]=parsed[key];}
fs.mkdirSync('public',{recursive:true});for(const file of ['index.html','core.js','store.js','purchase-service.js','bill-service.js','inventory-service.js','finance-plans.js','monthly-service.js','sw.js','manifest.webmanifest'])fs.copyFileSync(file,'public/'+file);
fs.mkdirSync('public/vendor',{recursive:true});
for(const name of ['app','auth','firestore'])fs.copyFileSync('node_modules/firebase/firebase-'+name+'-compat.js','public/vendor/firebase-'+name+'-compat.js');
fs.copyFileSync('node_modules/chart.js/dist/chart.umd.js','public/vendor/chart.umd.js');
fs.writeFileSync('public/runtime-config.js','window.CASA_FIREBASE_CONFIG = '+JSON.stringify(config)+';\n');
console.log('Sitio preparado en public/');



fs.mkdirSync('public/icons',{recursive:true});for(const size of [180,192,512])fs.writeFileSync('public/icons/icon-'+size+'.png',require('./pwa-icons')(size));
