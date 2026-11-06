// SEC1 · run by the owner (Admin SDK, bypasses rules): moves AI provider keys out of the readable config
// `${APP}/root/apiProviders/config` into `${APP}/root/apiProviderSecrets/{provider}` and strips them from the config.
// Usage (from the repo root, with credentials for the project, e.g. `gcloud auth application-default login`):
//   node tools/security/migrateApiKeys.mjs --project my-boq-app [--app my-boq-app] [--dry-run]
// Afterwards: rotate (re-issue) every moved key at the provider — the old key may already have been read.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const arg=(n,d)=>{const i=process.argv.indexOf(`--${n}`);return i>0?process.argv[i+1]:d;},dry=process.argv.includes('--dry-run');
const projectId=arg('project'),APP=arg('app','my-boq-app');
if(!projectId){console.error('--project <firebase project id> is required');process.exit(1);}
admin.initializeApp({projectId});
const db=admin.firestore(),cfgRef=db.doc(`${APP}/root/apiProviders/config`);
const moved=await db.runTransaction(async tx=>{
 const s=await tx.get(cfgRef);if(!s.exists)return [];
 const cfg=s.data(),providers=cfg.providers||{},out=[],at=new Date().toISOString();
 for(const [id,v] of Object.entries(providers)){
  if(!v||typeof v!=='object'||!v.apiKey)continue;
  out.push(id);
  if(!dry)tx.set(db.doc(`${APP}/root/apiProviderSecrets/${id}`),{apiKey:String(v.apiKey),updatedAt:at,updatedBy:'migrateApiKeys',migratedFromConfig:true});
 }
 if(!dry&&out.length){const next={...providers};for(const id of out){const {apiKey:_k,...rest}=next[id];next[id]={...rest,hasApiKey:true};}tx.update(cfgRef,{providers:next,updatedAt:at,updatedBy:'migrateApiKeys'});}
 return out;
});
console.log(dry?'would move':'moved',moved.length?moved.join(', '):'nothing (no key left in the config)');
if(moved.length&&!dry)console.log('Now rotate these keys at the providers and save the new keys in “จัดการ API”.');
