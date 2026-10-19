// Private checkpoint of selected recovered fields only. This is not the app's full Backup.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014';
const destination=root+'/selected-checkpoint';await fs.mkdir(destination,{recursive:true});
const response=await fetch('http://127.0.0.1:8662/emulator/v1/projects/demo-boq-v041:export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({database:'projects/demo-boq-v041/databases/(default)',export_directory:destination,export_name:'firestore_export'}),signal:AbortSignal.timeout(55000)});
assert.equal(response.status,200);await response.json();
const files=[];async function scan(dir,relative=''){for(const item of await fs.readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name,rel=relative+item.name;if(item.isDirectory())await scan(path,rel+'/');else {const bytes=await fs.readFile(path);files.push({name:rel,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await scan(destination);assert.ok(files.some(x=>x.name.endsWith('.overall_export_metadata')));
await fs.writeFile('output/data-recovery-verification/selected-checkpoint-results.json',JSON.stringify({status:'EXPORTED',scope:'Selected latest row fields only; no full Auth/Storage/database recovery',fileCount:files.length,files,coldReimportVerified:false,originalReplaced:false},null,2));console.log('PASS private selected Firestore checkpoint exported '+files.length+' files');
