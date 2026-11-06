// SEC1 · run by the owner (Admin SDK, bypasses rules): moves AI provider keys out of the readable config
// `${APP}/root/apiProviders/config` into `${APP}/root/apiProviderSecrets/{provider}` and strips them from the config.
// Dry run by default (reads only, lists what would move). Writing needs `--apply` and `--backup <folder>` (the config and the
// secret documents are saved as JSON first — the backup holds the keys: keep it outside the repo, delete it after rotating).
// Usage (from the repo root, with credentials for the project, e.g. `gcloud auth application-default login`):
//   node tools/security/migrateApiKeys.mjs --project my-boq-app [--app my-boq-app]                      (dry run)
//   node tools/security/migrateApiKeys.mjs --project my-boq-app --apply --backup <folder outside the repo>
// Emulator: set FIRESTORE_EMULATOR_HOST (see tools/security/migrationCheck.emu.mjs).
// Afterwards: rotate (re-issue) every moved key at the provider — the old key may already have been read.
import {createRequire} from 'node:module';
import {backupDir, writeBackup} from './backup.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const arg=(n,d)=>{const i=process.argv.indexOf(`--${n}`);return i>0?process.argv[i+1]:d;};
const apply=process.argv.includes('--apply')&&!process.argv.includes('--dry-run'),dir=backupDir(process.argv);
const projectId=arg('project'),APP=arg('app','my-boq-app');
if(!projectId){console.error('--project <firebase project id> is required');process.exit(1);}
if(apply&&!dir){console.error('--apply needs --backup <folder> (documents are saved there before any write)');process.exit(1);}
admin.initializeApp({projectId});
const db=admin.firestore(),cfgRef=db.doc(`${APP}/root/apiProviders/config`);
console.log(`${apply?'APPLY':'DRY RUN (nothing written; add --apply --backup <folder> to write)'} · project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST?` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})`:''} · ${cfgRef.path}`);
const keyed=s=>{if(!s.exists)return [];return Object.entries(s.data().providers||{}).filter(([,v])=>v&&typeof v==='object'&&v.apiKey).map(([id])=>id);};
const planned=keyed(await cfgRef.get());
for(const id of planned)console.log(`  ${id}: key in the config → ${APP}/root/apiProviderSecrets/${id} (config keeps hasApiKey: true)`);
if(apply&&planned.length){
 const file=await writeBackup(db,dir,'migrateApiKeys',[cfgRef,...planned.map(id=>db.doc(`${APP}/root/apiProviderSecrets/${id}`))]);
 console.log(`  backup: ${file} (holds API keys — keep it private)`);
}
const moved=await db.runTransaction(async tx=>{
 const s=await tx.get(cfgRef);if(!s.exists)return [];
 const cfg=s.data(),providers=cfg.providers||{},out=keyed(s),at=new Date().toISOString();
 if(!apply||!out.length)return out;
 if(out.some(id=>!planned.includes(id)))throw new Error('the config changed after the backup — run again');
 for(const id of out)tx.set(db.doc(`${APP}/root/apiProviderSecrets/${id}`),{apiKey:String(providers[id].apiKey),updatedAt:at,updatedBy:'migrateApiKeys',migratedFromConfig:true});
 const next={...providers};for(const id of out){const {apiKey:_k,...rest}=next[id];next[id]={...rest,hasApiKey:true};}
 tx.update(cfgRef,{providers:next,updatedAt:at,updatedBy:'migrateApiKeys'});
 return out;
});
console.log(apply?'moved':'would move',moved.length?moved.join(', '):'nothing (no key left in the config)');
if(moved.length&&apply)console.log('Now rotate these keys at the providers and save the new keys in “จัดการ API”.');
