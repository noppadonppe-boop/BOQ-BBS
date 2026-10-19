import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const out='output/boq-basis-verification',hash=b=>createHash('sha256').update(b).digest('hex');
const protectedFiles=JSON.parse(await fs.readFile('output/drawing-pagination-verification/protected-config.json','utf8'));
for(const item of protectedFiles){item.actualSha256=hash(await fs.readFile(item.file));item.unchanged=item.actualSha256===item.sha256;assert.ok(item.unchanged,item.file);}
await fs.writeFile(out+'/protected-config.json',JSON.stringify(protectedFiles,null,2));
const refs=JSON.parse(await fs.readFile('output/drawing-pagination-verification/reference-checksums.json','utf8'));
for(const item of refs){item.actualSha256=hash(await fs.readFile('Referrence/ตัวอย่าง BBS/'+item.name));item.unchanged=item.actualSha256===item.sha256;assert.ok(item.unchanged,item.name);}
await fs.writeFile(out+'/reference-checksums.json',JSON.stringify(refs,null,2));
const u=JSON.parse(await fs.readFile(out+'/unit-results.json','utf8'));assert.equal(u.numFailedTests,0);assert.equal(u.numPassedTests,1360);
const scenarios=[];for(const phase of ['resume','ui','exports']){const result=JSON.parse(await fs.readFile(`${out}/${phase}-results.json`,'utf8'));assert.deepEqual(result.cloud,[]);assert.deepEqual(result.errors,[]);assert.ok(result.results.every(r=>r.status==='PASS'));scenarios.push(...result.results);}
assert.equal(scenarios.length,5);for(const a of JSON.parse(await fs.readFile(out+'/artifacts.json','utf8')))assert.equal(hash(await fs.readFile(out+'/'+a.local)),a.sha256);
await fs.writeFile(out+'/checkpoint-results.json',JSON.stringify({status:'PASS',unitCases:u.numPassedTests,unitFiles:u.testResults.length,localScenarios:scenarios.length,scenarios,protectedFiles:protectedFiles.length,gulfReferences:refs.length,artifactHashes:true,productionRequests:false},null,2));console.log('PASS:1360 tests, '+u.testResults.length+' files, 5 actual local scenarios, 9 protected/7 reference files, output hashes');
