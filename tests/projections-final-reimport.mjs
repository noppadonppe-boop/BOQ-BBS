import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {client,read,readObject,readFile,list,bytesHash,deleteApp} from './helpers/firebase-local.mjs';
import {decodeStorage} from '../tmp/real-app-tests/projections-domain.mjs';
const c=await client('qa@form.local','projections-final-reimport'),results=[];
try{
 const ctx=JSON.parse(await fs.readFile('output/projections-verification/context.json','utf8')),ui=JSON.parse(await fs.readFile('output/projections-verification/ui-results.json','utf8'));
 const live=decodeStorage((await read(c,ctx.projectId,'members',ctx.memberId)).data());assert.equal(live.bars[0].dimensionView,'XZ');assert.equal(live.bars[0].spatialDimensions[0].to[0],610);assert.equal(live.bars[1].spatialDimensions.length,12);results.push({name:'latest working views and references recovered',status:'PASS'});
 const rev=(await read(c,ctx.projectId,'revisions',ctx.revisionId)).data(),b=await readObject(c,rev.snapshot);assert.equal(b.members[0].bars[0].dimensionView,'XY');assert.equal(b.members[0].bars[0].spatialDimensions[0].to[0],608);assert.deepEqual(b.calculations[ctx.memberId].bars.map(r=>r.cutLength),ctx.cuts);results.push({name:'latest Frozen view/coordinates/cuts recovered',status:'PASS'});
 const jobs=await list(c,ctx.projectId,'exportJobs'),j=jobs.docs.map(d=>d.data()).find(j=>j.file?.sha256===ui.restoredPdfHash);assert.ok(j);const r=await readFile(c,j.file.path);assert.ok(r.ok);assert.equal(bytesHash(Buffer.from(await r.arrayBuffer())),ui.restoredPdfHash);results.push({name:'latest A1 bytes recovered with exact SHA256',status:'PASS'});
 const restored=decodeStorage((await read(c,ui.restoredPid,'members',ctx.memberId)).data());assert.equal(restored.bars[0].dimensionView,'XZ');assert.ok(restored.bars.every(b=>!b.bsDimensionsConfirmed&&!b.placementConfirmed));results.push({name:'ZIP-restored project retains Draft/review reset after service restart',status:'PASS'});
 await fs.writeFile('output/projections-verification/final-reimport-results.json',JSON.stringify({results,scope:'Representative application data and artifact checks after default-data reimport. Not whole-database parity or production disaster recovery acceptance.'},null,2));console.log('PASS final default-data reimport:4 representative checks');
}finally{await deleteApp(c.app);}
