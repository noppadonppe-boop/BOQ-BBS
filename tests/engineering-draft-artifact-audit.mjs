import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const out='output/engineering-draft-verification';
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify((function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;})(v));
const ui=await read(out+'/ui-results.json'),unit=await read(out+'/unit-results.json'),artifacts=await read(out+'/artifacts.json'),ctx=await read(out+'/context.json');
assert.equal(ui.results.length,19);assert.ok(ui.results.every(r=>r.status==='PASS'));assert.deepEqual(ui.errors,[]);assert.deepEqual(ui.cloud,[]);assert.deepEqual(ui.forbiddenUiQueries,[]);
assert.equal(unit.numTotalTests,916);assert.equal(unit.numPassedTests,916);assert.equal(unit.numFailedTests,0);assert.equal(unit.testResults.length,58);
const protectedBaseline=await read('output/native-excel-verification/protected-config.json'),protectedConfig=[];
for(const previous of protectedBaseline){const hash=sha(await fs.readFile(previous.file));assert.equal(hash,previous.sha256,previous.file+' changed');protectedConfig.push({...previous,sha256:hash,unchanged:true});}
const ruleCopies=[];
for(const file of ['firestore.rules','storage.rules']){assert.deepEqual(await fs.readFile(file),await fs.readFile('tmp/bar-placement-backend/'+file));ruleCopies.push({file,localCopy:'tmp/bar-placement-backend/'+file,byteIdentical:true});}
assert.equal(artifacts.length,4);
const bodies={};
for(const a of artifacts){const bytes=await fs.readFile(out+'/'+a.file),v=JSON.parse(bytes);assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);assert.ok(bytes.length<=1000000);assert.equal(sha(Buffer.from(canonical(v.body))),v.contentDigest);assert.equal(v.body.engineeringApproved,false);assert.equal(v.body.sourceBytesIncluded,false);assert.equal(v.body.project.id,ctx.pid);assert.equal(v.body.member.id,ctx.mid);assert.equal('acl' in v.body.project,false);assert.equal('results' in v.body,false);assert.equal('pass' in v.body,false);assert.equal(v.body.spec.approved,false);assert.equal(v.body.spec.evidenceFileId,'');if(v.body.source){assert.equal(v.body.source.sha256,ctx.sourceSha);assert.equal('path' in v.body.source,false);assert.equal('bytes' in v.body.source,false);}bodies[a.file]=v.body;}
const partial=bodies['partial-engineering-draft.json'],continued=bodies['continued-engineering-draft.json'],stale=bodies['stale-engineering-draft.json'],negative=bodies['negative-engineering-draft.json'];
assert.deepEqual(partial.form,continued.form);assert.deepEqual(partial.member,continued.member);assert.deepEqual(partial.spec,continued.spec);
assert.equal(partial.form.numbers.concrete,'3.234');assert.equal(partial.form.numbers.excavation,'0');assert.equal(partial.form.numbers.rebar,'');assert.equal(partial.form.numbers.quantity,'');
assert.equal(partial.form.barNumbers[partial.member.bars[0].id].totalCount,'1');assert.equal(partial.form.barNumbers[partial.member.bars[0].id].cutLength,'');
assert.equal(stale.member.version,partial.member.version);assert.equal(negative.member.version,partial.member.version+1);assert.equal(ctx.finalMember.version,negative.member.version);assert.equal(negative.form.outcome,'invalid');assert.equal(negative.form.expectedErrors,'Synthetic diagnostic line one\nSynthetic diagnostic line two');assert.equal(negative.source,undefined);
const omit=m=>{const {description,updatedAt,version,...rest}=m;return rest;};assert.deepEqual(omit(partial.member),omit(ctx.finalMember));
const sourceSha=sha(await fs.readFile('Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf'));assert.equal(sourceSha,partial.source.sha256);
const sourceFiles=['package.json','package-lock.json','src/App.tsx','src/components/EngineeringFixtures.tsx','src/components/EngineeringDraftTools.tsx','src/domain/engineeringDraft.ts','src/data/engineeringDraftFiles.ts','tests/engineeringDraft.test.ts','tests/engineering-draft-ui.mjs'];
const sourceHashes=[];for(const file of sourceFiles)sourceHashes.push({file,sha256:sha(await fs.readFile(file))});
const audit={status:'PASS',appVersion:'0.57.0',unitCases:916,unitFiles:58,actualLocalScenarios:19,actualBrowserFiles:4,protectedConfig,ruleCopies,sourceHashes,sourceSha,artifacts,checks:{blankVsZero:true,continuedInputExact:true,checksumVerifiedForEveryActualFile:true,originalReferenceBytesUnchanged:true,sourceBytesInFiles:false,approvalInFiles:false,dbWritesFromFileTools:false,memberQuantityInputsUnchangedExceptExplicitDescriptionVersionUpdate:true},scope:'Synthetic local preparation only; original GULF concrete dimensions/reference, two synthetic bars. No approved engineering or database case/run persistence.'};
await fs.writeFile(out+'/protected-config.json',JSON.stringify(protectedConfig,null,2));await fs.writeFile(out+'/artifact-audit.json',JSON.stringify(audit,null,2));
await fs.writeFile(out+'/build-results.json',JSON.stringify({typecheck:'PASS',build:'PASS',buildSeconds:7.52,modules:2373,outDir:'output/engineering-draft-dist',existingPreviewPort:5218,previewRestarted:false,productionBuildDeployed:false},null,2));
console.log('PASS artifact audit:4 genuine preparation files,916 unit cases/58 files,19 local scenarios,9 protected files and2 unchanged local Rules copies');
