import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium,admin,guard} from './auth-persistence-qa.mjs';
const ctx=JSON.parse(await fs.readFile('tmp/startup-bs8-compiled-context.json','utf8')),out='output/startup-bs8-verification';
const runtime='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',skillRoot='C:/Users/Administrator/.codex/plugins/cache/openai-primary-runtime';
const b=await chromium.launch({headless:true}),p=await b.newPage({acceptDownloads:true}),cloud=[],errors=[],artifacts=[];let markedPDF=false;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const marker=(kind,count)=>execFileSync(runtime,[`${skillRoot}/${kind==='pdf'?'pdf':'spreadsheets'}/26.1007.11041/skills/${kind==='pdf'?'pdf':'spreadsheets'}/container_tools/mark_artifact_operation_started.mjs`,'--operation-kind','create','--expected-output-count',String(count),'--output-format',kind],{stdio:'pipe'});
try{
 await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5291/tests/context-harness.html');await p.evaluate(async a=>{const f=await import('/src/data/firebase.ts');if(!f.emulator)throw Error('Local only');await(await import('/src/auth/authService.ts')).loginWithEmail(a.email,a.password);},admin);
 const revision=await p.evaluate(async pid=>{const f=await import('/src/data/firebase.ts'),r=await import('/src/data/projectReadback.ts');const project=await r.readProjectRecord(pid),rev=await f.command('freezeRevision',pid,{version:project.version});return r.readProjectRecord(pid,'revisions',rev.id);},ctx.pid);
 for(const [kind,size,layout,name]of [['excel','A3',undefined,'Startup-BS8-Draft.xlsx'],['drawing','A3','details-v2','Startup-BS8-Draft-A3.pdf'],['drawing','A1','schedule-v1','Startup-BS8-Draft-A1.pdf']]){
  const job=await p.evaluate(async q=>(await import('/src/data/firebase.ts')).command('exportSnapshot',q.pid,{revisionId:q.id}),{pid:ctx.pid,id:revision.id});
  const d=p.waitForEvent('download',{timeout:180000});d.catch(()=>{});
  if(kind==='excel')marker('xlsx',1);else if(!markedPDF){marker('pdf',2);markedPDF=true;}
  await p.evaluate(async q=>(await import('/src/data/exports.ts')).generateJob(q.pid,q.job,q.kind,q.size,q.layout,true),{pid:ctx.pid,job,kind,size,layout});
  await(await d).saveAs(path.resolve(out,name));const bytes=await fs.readFile(out+'/'+name);
  const registered=await p.evaluate(async q=>(await import('/src/data/projectReadback.ts')).readProjectRecord(q.pid,'exportJobs',q.id),{pid:ctx.pid,id:job.id});assert.equal(registered.status,'Complete');assert.equal(registered.file.sha256,hash(bytes));artifacts.push({name,sha256:hash(bytes),size:bytes.length});
 }
 const bundle=await p.evaluate(async r=>(await import('/src/data/snapshots.ts')).loadSnapshot(r),revision);assert.equal(bundle.project.spec.minimumStandard,'bs8666-2000-v8');assert.equal(bundle.project.spec.approved,false);assert.equal(bundle.members[0].bars[0].shapeCode,'33');
 assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);await fs.writeFile('tmp/startup-bs8-export-context.json',JSON.stringify({pid:ctx.pid,revision,bundle}));await fs.writeFile(out+'/exports-results.json',JSON.stringify({status:'PASS',scope:'Synthetic Draft from actual new-project v8 default; not engineering/fabrication approval',artifacts,registeredHashesExact:true,productionRequests:false,cloud,errors},null,2));console.log('PASS actual registered default8 Frozen Excel/A3/A1 Draft exports and exact download hashes');
}finally{await b.close();}
