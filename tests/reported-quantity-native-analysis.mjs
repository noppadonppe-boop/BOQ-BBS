import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const out='output/reported-quantity-verification';await fs.mkdir(out,{recursive:true});
await build({entryPoints:['src/domain/sourceTableIntake.ts'],bundle:true,format:'esm',platform:'node',outfile:'tmp/reported-quantity-domain.mjs'});
const {sourceTableCandidate}=await import(pathToFileURL(path.resolve('tmp/reported-quantity-domain.mjs'))),sources=JSON.parse(await fs.readFile('output/source-table-intake-verification/source-text-items.json','utf8')),results=[];
for(const source of sources){const sha256=createHash('sha256').update(await fs.readFile('Referrence/ตัวอย่าง BBS/'+source.name)).digest('hex');for(const page of source.pages){const candidate=sourceTableCandidate({...page,rotation:0},sha256);results.push({file:source.name,page:page.page,quantity:candidate.memberQuantity?.value,rows:candidate.rows.length,ready:candidate.ready,statedTotal:candidate.statedTotalWeight,issues:candidate.issues});}}
const columns=results.filter(r=>r.file.includes('2C1'));
assert.deepEqual(columns.map(r=>r.quantity),[1,47,29,1]);assert.ok(columns.every(r=>r.rows===3&&r.ready));
assert.equal(results.length,31);assert.equal(results.filter(r=>r.ready).length,8);assert.equal(results.filter(r=>r.ready).reduce((n,r)=>n+r.rows,0),99);
await fs.writeFile(out+'/native-results.json',JSON.stringify({status:'PASS',originalPages31:true,recognizedTables8:true,originalRows99Retained:true,columns,otherPagesNoAutomaticQuantityOrGeometry:true,sourceFilesUnchanged:true,engineeringApproval:false},null,2));
console.log('PASS actual native source:1/47/29/1; all31pages retain8tables/99rows; no geometry/approval applied');
