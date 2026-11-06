// T1 · run by the owner (Admin SDK, bypasses rules), the alternative to the in-app button (MasterAdmin › จัดการผู้ใช้งาน ›
// “ย้าย Template เดิม เข้าโครงการ”): moves old element templates saved “เฉพาะโครงการนี้” — central documents
// `${APP}/root/elementTemplates/{id}` with `scope: 'project'` + `projectId` — into `projects/{projectId}/elementTemplates/{id}`
// (same id). Idempotent: a copy that already exists with the same or a newer version is kept; the originals are deleted only
// after every copy is in place. Central templates (`scope: 'workspace'`) stay where they are.
// Dry run by default (reads only, logs every document it would copy / delete). Writing needs `--apply` and
// `--backup <folder>` (originals + targets saved as JSON first; put back with restoreBackup.mjs).
// Usage (from the repo root, with credentials for the project, e.g. `gcloud auth application-default login`):
//   node tools/security/migrateElementTemplates.mjs --project my-boq-app [--app my-boq-app]          (dry run)
//   node tools/security/migrateElementTemplates.mjs --project my-boq-app --apply --backup <folder>
// Emulator: set FIRESTORE_EMULATOR_HOST (see tools/security/migrationCheck.emu.mjs).
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
const db=admin.firestore(),central=`${APP}/root/elementTemplates`;
console.log(`${apply?'APPLY':'DRY RUN (nothing written; add --apply --backup <folder> to write)'} · project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST?` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})`:''} · ${central}`);
const all=(await db.collection(central).get()).docs.map(d=>({ref:d.ref,data:d.data()}));
const move=all.filter(t=>t.data.scope==='project'&&typeof t.data.projectId==='string'&&t.data.projectId);
const target=t=>db.doc(`projects/${t.data.projectId}/elementTemplates/${t.ref.id}`);
const report={total:move.length,copied:0,skipped:0,conflicts:[],deleted:0,keep:all.length-move.length};
for(const t of move){const s=await target(t).get();
 console.log(`  ${t.ref.path} (v${t.data.version}, ${t.data.projectCode||t.data.projectId} · ${t.data.name}) → ${target(t).path}${s.exists?` [exists v${s.data().version}]`:''} · then delete the original`);}
if(apply&&move.length){
 const file=await writeBackup(db,dir,'migrateElementTemplates',move.flatMap(t=>[t.ref,target(t)]));
 console.log(`  backup: ${file}`);
}
for(const t of move){
 await db.runTransaction(async tx=>{
  const s=await tx.get(target(t)),v=s.exists?Number(s.data().version)||0:-1;
  if(v>=Number(t.data.version)){report.skipped++;if(v>Number(t.data.version))report.conflicts.push(`${t.data.projectCode||t.data.projectId} · ${t.data.name}`);return;}
  report.copied++;
  if(apply)tx.set(target(t),{...t.data,scope:'project',origin:{...(t.data.origin||{}),migratedFrom:`${central}/${t.ref.id}`}});
 });
}
if(apply){
 for(const t of move){const s=await target(t).get();
  if(!s.exists||Number(s.data().version)<Number(t.data.version)){console.error(`copy missing for ${t.ref.id} — nothing deleted, run again`);process.exit(2);}}
 for(const t of move){await t.ref.delete();report.deleted++;}
}
console.log(apply?'done:':'dry run (nothing written):',JSON.stringify(report,null,1));
