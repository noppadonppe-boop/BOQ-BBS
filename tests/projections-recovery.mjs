import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {client,read,readObject,readFile,list,bytesHash,deleteApp} from './helpers/firebase-local.mjs';
import {decodeStorage} from '../tmp/real-app-tests/projections-domain.mjs';
const c=await client('qa@form.local','projections-recovery'),results=[];
try{
 const v13=JSON.parse(await fs.readFile('output/measurements-verification/context.json','utf8'));
 const current=JSON.parse(await fs.readFile('output/projections-verification/initial-attempt/context.json','utf8'));
 for(const [label,ctx] of [['v0.13',v13],['v0.14 first UI save',current]]){
  const m=decodeStorage((await read(c,ctx.projectId,'members',ctx.memberId)).data());assert.equal(m.bars[0].spatialDimensions[0].to[0],610);assert.equal(m.bars[1].spatialDimensions.length,12);
  const r=(await read(c,ctx.projectId,'revisions',ctx.revisionId)).data(),b=await readObject(c,r.snapshot);assert.equal(b.members[0].bars[0].spatialDimensions[0].to[0],608);assert.deepEqual(b.calculations[ctx.memberId].bars.map(r=>r.cutLength),ctx.cuts);
  if(label.startsWith('v0.14')){assert.equal(m.bars[0].dimensionView,'XZ');assert.equal(b.members[0].bars[0].dimensionView,'XY');}
  results.push({name:label+' working/Frozen data recovered',status:'PASS'});
 }
 const sha='9319f3f0193d5a3ef92ae1f9cd081803a28a25bd6fe77b31b2187b314e78d378',jobs=await list(c,v13.projectId,'exportJobs'),j=jobs.docs.map(d=>d.data()).find(j=>j.file?.sha256===sha);assert.ok(j);const r=await readFile(c,j.file.path);assert.ok(r.ok);assert.equal(bytesHash(Buffer.from(await r.arrayBuffer())),sha);results.push({name:'previous v0.13 A1 artifact recovered with exact SHA256',status:'PASS'});
 await fs.writeFile('output/projections-verification/recovery-reimport-results.json',JSON.stringify({results,scope:'Representative existing working/Frozen data and a prior artifact, not whole-database parity or production recovery acceptance'},null,2));console.log('PASS recovery reimport: representative prior/live/Frozen data and old A1 SHA256');
}finally{await deleteApp(c.app);}
