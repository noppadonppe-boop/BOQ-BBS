// T1 · run by the owner (Admin SDK, bypasses rules), the alternative to the in-app button (MasterAdmin › จัดการผู้ใช้งาน ›
// “ย้าย Template เดิม เข้าโครงการ”): moves old element templates saved “เฉพาะโครงการนี้” — central documents
// `${APP}/root/elementTemplates/{id}` with `scope: 'project'` + `projectId` — into `projects/{projectId}/elementTemplates/{id}`
// (same id). Idempotent: a copy that already exists with the same or a newer version is kept; the originals are deleted only
// after every copy is in place. Central templates (`scope: 'workspace'`) stay where they are.
// Usage (from the repo root, with credentials for the project, e.g. `gcloud auth application-default login`):
//   node tools/security/migrateElementTemplates.mjs --project my-boq-app [--app my-boq-app] [--dry-run]
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const arg=(n,d)=>{const i=process.argv.indexOf(`--${n}`);return i>0?process.argv[i+1]:d;},dry=process.argv.includes('--dry-run');
const projectId=arg('project'),APP=arg('app','my-boq-app');
if(!projectId){console.error('--project <firebase project id> is required');process.exit(1);}
admin.initializeApp({projectId});
const db=admin.firestore(),central=`${APP}/root/elementTemplates`;
const all=(await db.collection(central).get()).docs.map(d=>({ref:d.ref,data:d.data()}));
const move=all.filter(t=>t.data.scope==='project'&&typeof t.data.projectId==='string'&&t.data.projectId);
const report={total:move.length,copied:0,skipped:0,conflicts:[],deleted:0,keep:all.length-move.length};
for(const t of move){
 const target=db.doc(`projects/${t.data.projectId}/elementTemplates/${t.ref.id}`);
 await db.runTransaction(async tx=>{
  const s=await tx.get(target),v=s.exists?Number(s.data().version)||0:-1;
  if(v>=Number(t.data.version)){report.skipped++;if(v>Number(t.data.version))report.conflicts.push(`${t.data.projectCode||t.data.projectId} · ${t.data.name}`);return;}
  report.copied++;
  if(!dry)tx.set(target,{...t.data,scope:'project',origin:{...(t.data.origin||{}),migratedFrom:`${central}/${t.ref.id}`}});
 });
}
if(!dry){
 for(const t of move){const s=await db.doc(`projects/${t.data.projectId}/elementTemplates/${t.ref.id}`).get();
  if(!s.exists||Number(s.data().version)<Number(t.data.version)){console.error(`copy missing for ${t.ref.id} — nothing deleted, run again`);process.exit(2);}}
 for(const t of move){await t.ref.delete();report.deleted++;}
}
console.log(dry?'dry run (nothing written):':'done:',JSON.stringify(report,null,1));
