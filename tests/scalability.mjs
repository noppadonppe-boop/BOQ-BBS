import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc} from 'firebase/firestore';
const out='output/scalability-verification';await fs.mkdir(out,{recursive:true});
await build({entryPoints:['src/domain/model.ts'],bundle:true,platform:'node',format:'esm',outfile:'tmp/real-app-tests/model-v3.mjs'});
const {blankMember,blankBar}=await import(pathToFileURL(process.cwd()+'/tmp/real-app-tests/model-v3.mjs'));
async function client(email,name){const app=initializeApp({apiKey:'demo-api-key',projectId:'demo-boq-bbs'},name),auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});try{await signInWithEmailAndPassword(auth,email,'local-test-123');}catch{await createUserWithEmailAndPassword(auth,email,'local-test-123');}const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);return {app,auth,db};}
const c=await client('qa@form.local','scale-qa'),outsider=await client('scale-outsider@form.local','scale-outsider'),results=[];
async function call(action,pid,data={},requestId=crypto.randomUUID()){const token=await c.auth.currentUser.getIdToken(),response=await fetch('http://127.0.0.1:5001/demo-boq-bbs/us-central1/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data:{action,projectId:pid,requestId,...data}})}),r=await response.json();if(r.error)throw Error(`${r.error.status}: ${r.error.message}`);return r.result;}
async function readFile(who,path){return fetch('http://127.0.0.1:9199/v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(path)+'?alt=media',{headers:{Authorization:`Bearer ${await who.auth.currentUser.getIdToken()}`},signal:AbortSignal.timeout(15000)});}
async function load(record){const r=await readFile(c,record.snapshot.path);assert.ok(r.ok,await r.clone().text());const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,record.snapshot.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.digest);return JSON.parse(bytes.toString());}
const pid=(await call('createProject',undefined,{project:{code:'SCALE-'+Date.now(),name:'ทดสอบโครงการ 120 สมาชิก / TEST',owner:'Software QA',location:'Local emulator',notes:'Synthetic fixture; not engineering approval'}})).id;
const ids=[];for(let i=0;i<120;i++){
 const m=blankMember('Slab','S-'+String(i+1).padStart(3,'0'));m.description='Synthetic QA member '+i;m.occurrences[0].quantity=2;
 m.bars=Array.from({length:12},(_,j)=>({...blankBar('B'+String(j+1).padStart(2,'0')),count:1,distributionStart:200+j*250,distributionEnd:200+j*250,note:'QA reference '.repeat(35)}));
 await call('saveMember',pid,{member:m});ids.push(m.id);if((i+1)%30===0)console.log('Created',i+1,'/ 120 members');
}
const project=async()=>(await getDoc(doc(c.db,`projects/${pid}`))).data(),read=async(name,id)=>(await getDoc(doc(c.db,`projects/${pid}/${name}/${id}`))).data();
const key=crypto.randomUUID(),job=await call('exportSnapshot',pid,{},key),bundle=await load(job);
assert.ok(job.snapshot.size>500000);assert.equal(bundle.members.length,120);assert.equal(job.bundle,undefined);assert.ok(JSON.stringify(job).length<1500);
assert.deepEqual(await call('exportSnapshot',pid,{},key),job);const audit=await read('operations',key);assert.equal(audit.result.bundle,undefined);assert.ok(JSON.stringify(audit).length<2200);
results.push({name:'120-member snapshot exceeds old limit; compact manifest and idempotent audit',status:'PASS',snapshotBytes:job.snapshot.size,manifestBytes:Buffer.byteLength(JSON.stringify(job))});console.log('PASS large snapshot',job.snapshot.size);
const frozen=await call('freezeRevision',pid,{version:(await project()).version}),revision=await read('revisions',frozen.id),before=await load(revision);
assert.equal(revision.bundle,undefined);assert.equal(before.members.length,120);const first=await read('members',ids[0]);first.x+=100;await call('saveMember',pid,{member:first});assert.deepEqual(await load(revision),before);
const revisionJob=await call('exportSnapshot',pid,{revisionId:frozen.id});assert.equal((await load(revisionJob)).calculations[ids[0]].concrete,before.calculations[ids[0]].concrete);
results.push({name:'large frozen revision preserves geometry and calculations after live edit',status:'PASS'});console.log('PASS large revision');
console.log('Checking outsider read');assert.equal((await readFile(outsider,job.snapshot.path)).status,403);console.log('Checking delete');
const token=await c.auth.currentUser.getIdToken(),url='http://127.0.0.1:9199/v0/b/demo-boq-bbs.appspot.com/o/'+encodeURIComponent(job.snapshot.path);
const deletion=await fetch(url,{method:'DELETE',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`}});assert.equal(deletion.status,403);console.log('Checking injected create');
const injectedPath=`projects/${pid}/snapshots/injected.json`,boundary='snapshot-test',body=Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:injectedPath,contentType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n{}\r\n--${boundary}--`);
const injection=await fetch('http://127.0.0.1:9199/v0/b/demo-boq-bbs.appspot.com/o?name='+encodeURIComponent(injectedPath),{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`,'X-Goog-Upload-Protocol':'multipart'},body});assert.equal(injection.status,403);console.log('Checking manifest write');
await assert.rejects(()=>setDoc(doc(c.db,`projects/${pid}/revisions/${frozen.id}`),{...revision,digest:'0'.repeat(64)}));
results.push({name:'outsider read and client snapshot create/delete/manifest rewrite denied',status:'PASS'});console.log('PASS ACL / immutability');
const scoped=await call('exportSnapshot',pid,{scope:{memberId:ids[0]}});assert.equal((await load(scoped)).members.length,1);
const backup=await call('exportSnapshot',pid,{backup:true}),backupBundle=await load(backup);assert.ok(backupBundle.historyIndex.some(h=>h.collection==='revisions'&&h.id===frozen.id));
results.push({name:'member scope and backup history capture remain available above old size limit',status:'PASS'});
await fs.writeFile(out+'/test-context.json',JSON.stringify({projectId:pid,firstMemberId:ids[0],revisionId:frozen.id,email:'qa@form.local',password:'local-test-123',jobId:job.id},null,2));
await fs.writeFile(out+'/integration-results.json',JSON.stringify(results,null,2));
for(const who of [c,outsider])await deleteApp(who.app);console.log('Scalability checks:',results.length);
