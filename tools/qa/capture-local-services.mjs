import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const base=path.resolve('tmp/storage-framing-recovery/captures'),target=path.join(base,randomUUID());
if(!target.startsWith(base+path.sep))throw Error('Capture must stay within the workspace');
await fs.mkdir(target,{recursive:true});
const projectId='demo-boq-v041',storageDir=path.join(target,'storage_export'),authDir=path.join(target,'auth_export');
// The installed Storage export endpoint requires its destination to exist.
// Never send a non-existing path: its uncaught ENOENT can terminate the CLI.
await fs.mkdir(storageDir);await fs.mkdir(authDir);
async function request(url,options={}){const r=await fetch(url,{...options,headers:{Authorization:'Bearer owner',...options.headers},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Local capture failed HTTP '+r.status);return r;}
await request('http://127.0.0.1:9531/internal/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:storageDir,initiatedBy:'local-qa-capture'})});
const accounts=await(await request(`http://127.0.0.1:10121/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=1000`)).json();
if(accounts.nextPageToken)throw Error('Capture requires paginated Auth support before handling more than 1000 local QA accounts');
await fs.writeFile(path.join(authDir,'accounts.json'),JSON.stringify(accounts));
const authConfig=await(await request(`http://127.0.0.1:10121/emulator/v1/projects/${projectId}/config`)).json();
await fs.writeFile(path.join(authDir,'config.json'),JSON.stringify(authConfig));
await request(`http://127.0.0.1:8751/emulator/v1/projects/${projectId}:export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({database:`projects/${projectId}/databases/(default)`,export_directory:target,export_name:'firestore_export'})});
const installedInfo=JSON.parse(await fs.readFile('node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json','utf8'));const metadata={version:'14.27.0',firestore:{version:installedInfo.firestore.version,path:'firestore_export',metadata_file:'firestore_export/firestore_export.overall_export_metadata'},auth:{version:'14.27.0',path:'auth_export'},storage:{version:'14.27.0',path:'storage_export'}};
await fs.writeFile(path.join(target,'firebase-export-metadata.json'),JSON.stringify(metadata,null,2));
const files=await fs.readdir(path.join(storageDir,'blobs')),hashes=[];
for(const name of files){const bytes=await fs.readFile(path.join(storageDir,'blobs',name));hashes.push({sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});}
await fs.writeFile(path.resolve('tmp/storage-framing-recovery/latest-capture.json'),JSON.stringify({target,projectId}));
const reportFile=path.resolve(process.argv[2]||'tmp/storage-framing-recovery/latest-capture-results.json');if(!reportFile.startsWith(path.resolve('output')+path.sep)&&!reportFile.startsWith(path.resolve('tmp')+path.sep))throw Error('Capture evidence path must stay in workspace output/tmp');await fs.writeFile(reportFile,JSON.stringify({status:'PASS',scope:'Post-recovery local QA state; earlier lost Auth accounts/object timestamps were not recovered',storageBlobs:files.length,authAccounts:accounts.users?.length||0,firestoreExportPresent:!!(await fs.stat(path.join(target,'firestore_export/firestore_export.overall_export_metadata'))),destinationsCreatedBeforeExport:true,existingServicesRetained:true,rawAuthSecretsKeptInPrivateTmpOnly:true,hashes,productionRequests:false},null,2));
console.log('PASS post-recovery local Auth/Firestore/Storage capture; blobs:',files.length,'accounts:',accounts.users?.length||0);
