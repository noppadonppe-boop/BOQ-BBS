import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,collection,getDocs} from 'firebase/firestore';
export const bytesHash=b=>createHash('sha256').update(b).digest('hex');
export async function client(email,name){const app=initializeApp({apiKey:'demo-api-key',projectId:'demo-boq-bbs'},name),auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});try{await signInWithEmailAndPassword(auth,email,'local-test-123');}catch{await createUserWithEmailAndPassword(auth,email,'local-test-123');}const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);return {app,auth,db};}
export async function call(who,action,pid,data={},requestId=randomUUID()){
 const r=await fetch('http://127.0.0.1:5001/demo-boq-bbs/us-central1/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await who.auth.currentUser.getIdToken()},body:JSON.stringify({data:{action,projectId:pid,requestId,...data}}),signal:AbortSignal.timeout(120000)}),body=await r.json();if(body.error)throw Error(body.error.status+': '+body.error.message);return body.result;
}
export async function upload(who,pid,bytes,name,type='application/json',folder='archive',specificPath,metadata){
 const id=randomUUID(),path=specificPath||`projects/${pid}/${folder}/${id}/${folder==='archive'?randomUUID()+'/':''}${name}`,boundary='fixture-'+randomUUID(),body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:path,contentType:type,...(metadata?{metadata}:{})})}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
 const r=await fetch('http://127.0.0.1:9199/v0/b/demo-boq-bbs.appspot.com/o?name='+encodeURIComponent(path),{method:'POST',headers:{Authorization:'Bearer '+await who.auth.currentUser.getIdToken(),'Content-Type':`multipart/related; boundary=${boundary}`,'X-Goog-Upload-Protocol':'multipart'},body,signal:AbortSignal.timeout(30000)});return {response:r,file:{id,path,name,size:bytes.length,contentType:type,sha256:bytesHash(bytes)}};
}
export async function readFile(who,path){return fetch('http://127.0.0.1:9199/v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(path)+'?alt=media',{headers:{Authorization:'Bearer '+await who.auth.currentUser.getIdToken()},signal:AbortSignal.timeout(30000)});}
export async function readObject(who,file){const r=await readFile(who,file.path);assert.ok(r.ok,await r.clone().text());const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,file.size);assert.equal(bytesHash(bytes),file.sha256);return JSON.parse(bytes.toString());}
export const read=(who,pid,name,id)=>getDoc(doc(who.db,`projects/${pid}/${name}/${id}`));
export const list=(who,pid,name)=>getDocs(collection(who.db,`projects/${pid}/${name}`));
export async function create(who,code){return (await call(who,'createProject',undefined,{project:{code:code+'-'+Date.now(),name:code+' / software QA',owner:'QA',location:'Local emulator',notes:'Synthetic software fixture; no engineering approval'}})).id;}
export {deleteApp,doc,getDoc};
