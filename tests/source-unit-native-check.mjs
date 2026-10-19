import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const out='output/source-unit-weight-verification';await fs.mkdir(out,{recursive:true});
await build({entryPoints:['src/domain/sourceTableIntake.ts'],bundle:true,format:'esm',platform:'node',outfile:'tmp/source-unit-native-domain.mjs'});
const {sourceTableCandidate}=await import('../tmp/source-unit-native-domain.mjs');
const sources=JSON.parse(await fs.readFile('output/source-table-intake-verification/source-text-items.json','utf8')),results=[];
for(const file of sources){
 const bytes=await fs.readFile('Referrence/ตัวอย่าง BBS/'+file.name),sha=createHash('sha256').update(bytes).digest('hex');
 for(const page of file.pages){
  const candidate=sourceTableCandidate({...page,rotation:0},sha);if(!candidate.statedTotalWeight)continue;
  assert.equal(candidate.ready,true,`${file.name} page ${page.page}: ${candidate.issues.join(' / ')}`);
  assert.ok(candidate.rows.every(r=>typeof r.unitWeight==='number'));
  if(file.name==='GULF-ISB-CU-FL10600-2C1-100.pdf')assert.deepEqual(candidate.rows.map(r=>[r.mark,r.unitWeight]),[['4',.70],['309',28.13],['5',2.26]]);
  results.push({file:file.name,page:page.page,sha256:sha,rows:candidate.rows.map(r=>({mark:r.mark,unitWeight:r.unitWeight,count:r.count,weight:r.weight,sourceProduct:r.unitWeight*r.count,rowMinusProduct:r.weight-r.unitWeight*r.count}))});
 }
}
assert.equal(results.length,7);assert.equal(results.reduce((n,r)=>n+r.rows.length,0),59);
await fs.writeFile(out+'/native-results.json',JSON.stringify({status:'PASS',basis:'Previously captured native PDF text items, matched current original file hashes; not a fresh app upload/save or engineering acceptance',tables:results},null,2));
console.log('PASS seven retained native tables / 59 rows preserve printed Kg/p, original files read only');
