'use strict';
// Reuse the surviving local Firestore. This starts only the verified-stopped
// local Auth/Storage services, with isolated disk storage and unchanged Rules.
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
const dir=path.join(root,'tmp/storage-framing-recovery');
fs.mkdirSync(path.join(dir,'config'),{recursive:true});
process.env.XDG_CONFIG_HOME=path.join(dir,'config');
process.env.FIREBASE_CLI_DISABLE_UPDATE_CHECK='true';
process.env.CI='true';
process.env.JAVA_TOOL_OPTIONS='-Xms128m -Xmx1024m';
const compatibility=require('./storage-runtime-lines.cjs').install(root);
const {EmulatorRegistry}=require('firebase-tools/lib/emulator/registry');
const {AuthEmulator}=require('firebase-tools/lib/emulator/auth');
const {StorageEmulator}=require('firebase-tools/lib/emulator/storage');
const projectId='demo-boq-v041';
const stateDir=path.join(dir,'runtime-blobs');
const sourceRules=path.join(root,'storage.rules');
StorageEmulator.prototype.getPersistenceTmpDir=()=>stateDir;
const auth=new AuthEmulator({projectId,host:'127.0.0.1',port:10121,singleProjectMode:2});
const storage=new StorageEmulator({projectId,host:'127.0.0.1',port:9531,auto_download:false,rules:{name:sourceRules,content:fs.readFileSync(sourceRules,'utf8')}});
async function start(){
 const fsHealth=await fetch('http://127.0.0.1:8751/',{signal:AbortSignal.timeout(5000)});
 if(!fsHealth.ok)throw Error('Surviving local Firestore must respond');
 for(const port of [10121,9531]){
  try{await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(2000)});throw Error(`Refusing to replace a listening service on ${port}`);}catch(e){if(e.cause?.code!=='ECONNREFUSED')throw e;}
 }
 // A read-only registry reference. No Firestore start/stop/replacement occurs.
 EmulatorRegistry.set('firestore',{getInfo:()=>({name:'firestore',host:'127.0.0.1',port:8751})});
 await EmulatorRegistry.start(auth);
 await EmulatorRegistry.start(storage);
 fs.writeFileSync(path.join(dir,'live-services.json'),JSON.stringify({pid:process.pid,projectId,ports:{auth:10121,storage:9531,firestoreReused:8751},compatibility,isolatedBlobs:true,protectedRulesChanged:false},null,2));
 console.log('READY local Auth10121/Storage9531; surviving Firestore8751 reused; unchanged Rules; line-framed runtime');
}
start().catch(e=>{console.error('Local recovery startup failed:',e.message);process.exitCode=1;});
