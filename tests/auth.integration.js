const test=require('node:test'),assert=require('node:assert/strict'),app=require('./app-fixture');
test('cambio con Firebase Auth real emulado exige contraseña actual y conserva UID',async()=>{
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099','Este test solo puede ejecutarse en emulador local');
 const firebase=require('firebase/compat/app');require('firebase/compat/auth');
 const instance=firebase.initializeApp({apiKey:'test-api-key',projectId:'demo-casa-al-dia',authDomain:'demo-casa-al-dia.firebaseapp.com'},'password-integration');const auth=instance.auth();auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});
 const email='password-'+Date.now()+'@example.test',old='Old-fixture-123!',next='New-fixture-456!';
 try{
  const {user}=await auth.createUserWithEmailAndPassword(email,old),uid=user.uid,f=app();f.ctx.firebase={auth:Object.assign(()=>auth,{EmailAuthProvider:firebase.auth.EmailAuthProvider})};f.api.setUser(user);
  const fields=()=>{for(const [id,value]of Object.entries({changePasswordForm:'',passwordCurrent:old,passwordNew:next,passwordConfirm:next,passwordError:'',passwordSave:''}))f.fields[id]={value,textContent:'',disabled:false};};
  fields();f.fields.passwordCurrent.value='Incorrect-fixture-123!';await f.App.changePassword();assert.match(f.fields.passwordError.textContent,/contraseña actual/);assert.equal(f.messages.length,0);
  fields();await f.App.changePassword();assert.match(f.messages[0],/Contraseña actualizada/);assert.equal(f.fields.passwordCurrent.value,'');assert.equal(f.fields.passwordNew.value,'');assert.equal(auth.currentUser.uid,uid);assert.equal(f.api.currentMember().id,'a');
  await auth.signOut();await assert.rejects(auth.signInWithEmailAndPassword(email,old));const signed=await auth.signInWithEmailAndPassword(email,next);assert.equal(signed.user.uid,uid);
 }finally{if(auth.currentUser)await auth.currentUser.delete();await instance.delete();}
});

test('integrante nuevo verifica su correo y renueva el ID token antes de aceptar',async()=>{
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
 const firebase=require('firebase/compat/app');require('firebase/compat/auth');const instance=firebase.initializeApp({apiKey:'test-api-key',projectId:'demo-casa-al-dia',authDomain:'demo-casa-al-dia.firebaseapp.com'},'invitation-auth'),auth=instance.auth();auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});
 try{const email='invite-'+Date.now()+'@example.test',{user}=await auth.createUserWithEmailAndPassword(email,'Fixture-password-123!');assert.equal(user.emailVerified,false);await user.sendEmailVerification();const response=await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-casa-al-dia/oobCodes'),data=await response.json(),code=data.oobCodes.find(c=>c.email===email&&c.requestType==='VERIFY_EMAIL');assert.ok(code);await auth.applyActionCode(code.oobCode);await user.reload();assert.equal(user.emailVerified,true);const token=await user.getIdToken(true),payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());assert.equal(payload.email_verified,true);assert.equal(payload.email,email);assert.equal(payload.user_id,user.uid);}finally{if(auth.currentUser)await auth.currentUser.delete();await instance.delete();}
});
