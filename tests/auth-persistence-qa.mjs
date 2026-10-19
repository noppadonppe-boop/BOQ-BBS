import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
export const require=createRequire(import.meta.url);
export const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
export const out='output/auth-persistence-verification';
export const admin=JSON.parse(await fs.readFile('output/auth-integration-verification/bootstrap-context.json','utf8'));
export const viewer=JSON.parse(await fs.readFile('output/fabrication-inspection-verification/context.json','utf8')).viewer;
export const ctx=JSON.parse(await fs.readFile('output/priced-boq-verification/context.json','utf8'));
export const modules=async dir=>(await fs.readdir(dir+'/assets')).filter(f=>/^index-.*\.js$/.test(f)).map(f=>'/assets/'+f);
export const login=async(p,user)=>{await p.getByLabel('อีเมล',{exact:true}).fill(user.email);await p.getByLabel('รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)').fill(user.password);await p.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await p.locator('.top-profile').waitFor();};
export const logout=async p=>{await p.locator('.top-profile').click();await p.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await p.getByLabel('อีเมล',{exact:true}).waitFor();};
export const guard=async(p,cloud,errors)=>{await p.route('**/*',r=>{if(/googleapis\.com$|firebaseio\.com$|firebasestorage\.app$/.test(new URL(r.request().url()).hostname)){cloud.push(r.request().url());return r.abort();}return r.continue();});p.on('pageerror',e=>errors.push(e.message));};
// Read only: return identity for comparisons and storage-kind/entry booleans.
// No tokens, passwords, storage values or fake events are recorded or written.
export const observe=(p,paths)=>p.evaluate(async paths=>{
 let auth;if(paths){for(const path of paths){const m=await import(path);auth=Object.values(m).find(v=>v&&typeof v==='object'&&typeof v.authStateReady==='function'&&typeof v.signOut==='function'&&v.app?.options.projectId==='demo-boq-v041');if(auth)break;}}else auth=(await import('/src/data/firebase.ts')).auth;
 if(!auth||auth.app.options.projectId!=='demo-boq-v041')throw Error('Isolated Auth required');await auth.authStateReady();const persistence=auth.persistenceManager.persistence;
 const dbs=await indexedDB.databases();let indexedUserPresent=false;
 if(dbs.some(db=>db.name==='firebaseLocalStorageDb'))indexedUserPresent=await new Promise((resolve,reject)=>{const open=indexedDB.open('firebaseLocalStorageDb');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;try{const tx=db.transaction('firebaseLocalStorage','readonly'),get=tx.objectStore('firebaseLocalStorage').get('firebase:authUser:demo-key:[DEFAULT]');get.onsuccess=()=>{resolve(!!get.result);db.close();};get.onerror=()=>{reject(get.error);db.close();};}catch(e){db.close();reject(e);}};});
 return {uid:auth.currentUser?.uid||null,storageKind:'dbPromise' in persistence?'IndexedDB':persistence.storage===localStorage?'localStorage':'other',localUserKeyPresent:Object.keys(localStorage).some(k=>k.startsWith('firebase:authUser:')),indexedUserPresent};
},paths);
