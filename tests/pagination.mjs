import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
const app=initializeApp({apiKey:'demo-api-key',projectId:'demo-boq-bbs'},'pagination-fixture'),auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(auth,'qa@form.local','local-test-123');
async function call(action,pid,data={}){const r=await fetch('http://127.0.0.1:5001/demo-boq-bbs/us-central1/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({data:{action,projectId:pid,requestId:randomUUID(),...data}})}),b=await r.json();if(b.error)throw Error(b.error.message);return b.result;}
const pid=(await call('createProject',undefined,{project:{code:'PAGED-HISTORY-'+Date.now(),name:'Revision pagination / software QA',owner:'QA',location:'Local',notes:'Synthetic software fixture'}})).id;
const JSZip=(await import('jszip')).default,zip=await JSZip.loadAsync(await fs.readFile('output/batch-verification/downloads/520-member-fixture.zip')),bundle=JSON.parse(await zip.file('manifest.json').async('string')),m=bundle.members[0];m.version=0;m.code='P-001';await call('saveMember',pid,{member:m});let first;
for(let i=0;i<31;i++){const r=await call('freezeRevision',pid,{version:2});if(i===0)first=r.id;}
for(let i=0;i<35;i++){const j=await call('exportSnapshot',pid),l=await call('startExport',pid,{jobId:j.id,kind:'excel',size:'A3'});await call('failExport',pid,{jobId:j.id,...l,error:'Pagination fixture only'});}
await fs.writeFile('output/batch-verification/pagination-context.json',JSON.stringify({projectId:pid,firstRevisionId:first,memberId:m.id,email:'qa@form.local',password:'local-test-123'},null,2));assert.ok(first);await deleteApp(app);console.log('Prepared 31 revisions / 35 failed export jobs');
