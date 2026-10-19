import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {client,read,readObject,readFile,list,bytesHash,deleteApp,doc,getDoc} from './helpers/firebase-local.mjs';

const c=await client('qa@form.local','scope-final-reimport'),results=[];
const dir='output/scope-verification';
try {
 const ctx=JSON.parse(await fs.readFile(dir+'/context.json','utf8')),ui=JSON.parse(await fs.readFile(dir+'/ui-results.json','utf8'));
 const [f,b,col]=await Promise.all(ctx.memberIds.map(async id=>(await read(c,ctx.projectId,'members',id)).data()));
 const project=(await getDoc(doc(c.db,`projects/${ctx.projectId}`))).data();
 assert.equal(f.status,'Draft');assert.equal(f.x,2500);assert.equal(f.occurrences[0].quantity,20);assert.equal(project.spec.density,8000);
 assert.equal([f,b,col].flatMap(m=>m.occurrences).reduce((n,o)=>n+o.quantity,0),52);
 const sources=(await list(c,ctx.projectId,'attachments')).docs.map(d=>d.data());
 for(const a of sources){const r=await readFile(c,a.path);assert.ok(r.ok);assert.equal(bytesHash(Buffer.from(await r.arrayBuffer())),a.sha256);}
 results.push({name:'Working Draft 52 elements / edited geometry and density / source bytes recovered',status:'PASS'});

 const rev=(await read(c,ctx.projectId,'revisions',ctx.revisionId)).data(),frozen=await readObject(c,rev.snapshot);
 assert.equal(rev.digest,ctx.frozenDigest);assert.equal(frozen.calculations[f.id].quantity,18);assert.equal(frozen.calculations[f.id].concrete,2.4);
 assert.deepEqual(frozen.calculations[f.id].bars.map(r=>r.cutLength),[3000,4000]);
 assert.equal(frozen.members.flatMap(m=>m.occurrences).reduce((n,o)=>n+o.quantity,0),34);
 results.push({name:'Frozen digest / original 34 elements / per-unit volume and manual cuts recovered',status:'PASS'});

 const j=(await read(c,ctx.projectId,'exportJobs',ui.zoneJobId)).data(),bundle=await readObject(c,j.snapshot);
 assert.deepEqual(j.summary.scope,{zone:'A',group:'Zone'});assert.equal(j.summary.quantity,12);
 assert.deepEqual(bundle.scope,j.summary.scope);assert.equal(bundle.calculations[f.id].quantity,5);
 assert.equal(j.file.sha256,ui.restoredScopedHash);const response=await readFile(c,j.file.path);assert.ok(response.ok);
 assert.equal(bytesHash(Buffer.from(await response.arrayBuffer())),ui.restoredScopedHash);
 results.push({name:'Scoped Zone history / original scope and quantities / stored PDF SHA256 recovered',status:'PASS'});

 const restoredMembers=(await list(c,ui.restoredId,'members')).docs.map(d=>d.data());
 assert.equal(restoredMembers.flatMap(m=>m.occurrences).reduce((n,o)=>n+o.quantity,0),52);assert.ok(restoredMembers.every(m=>m.status==='Draft'&&m.bars.every(b=>!b.placementConfirmed)));
 const restoredSources=(await list(c,ui.restoredId,'attachments')).docs.map(d=>d.data());
 for(const a of sources){const restored=restoredSources.find(r=>r.name===a.name&&r.sha256===a.sha256);assert.ok(restored);assert.deepEqual(restored.annotations,a.annotations);}
 const restoredHistory=(await list(c,ui.restoredId,'importedHistory')).docs.map(d=>d.data()),restored=restoredHistory.find(r=>r.originalCollection==='exportJobs'&&r.data.file?.sha256===ui.restoredScopedHash);assert.ok(restored);assert.deepEqual(restored.data.summary.scope,j.summary.scope);assert.equal(restored.data.summary.quantity,12);
 const restoredFile=restored.sourceRefs.find(r=>r.sha256===ui.restoredScopedHash);assert.ok(restoredFile);assert.equal(restoredFile.originalPath,j.file.path);
 const rr=await readFile(c,restoredFile.path);assert.ok(rr.ok);assert.equal(bytesHash(Buffer.from(await rr.arrayBuffer())),ui.restoredScopedHash);
 results.push({name:'ZIP-restored Draft 52 elements / remapped sources / original scoped artifact and history recovered',status:'PASS'});
 await fs.writeFile(dir+'/final-reimport-results.json',JSON.stringify({results,scope:'Four representative application checks after verified default-data reimport. Not whole-database parity or production disaster recovery acceptance.'},null,2));
 console.log('PASS default-data reimport: 4 representative scope/quantity/source/history checks');
} finally {await deleteApp(c.app);}
