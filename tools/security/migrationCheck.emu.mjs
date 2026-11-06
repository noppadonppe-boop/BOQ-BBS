// Dry run + apply + rollback of the migration scripts on the Firestore emulator only (never a real project):
//   firebase emulators:exec --config tools/security/emu.firebase.json --only firestore --project demo-boq-migrate "node tools/security/migrationCheck.emu.mjs"
// Seeds sample data, shows it before / after, checks: the dry run writes nothing, --apply without --backup is refused, apply
// moves keys / templates and writes a backup, a second run changes nothing, restoreBackup puts every document back.
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const host=process.env.FIRESTORE_EMULATOR_HOST,projectId=process.env.GCLOUD_PROJECT||'demo-boq-migrate';
if(!host||!projectId.startsWith('demo-')){console.error('emulator only: FIRESTORE_EMULATOR_HOST and a demo-* project are required');process.exit(1);}
admin.initializeApp({projectId});
const db=admin.firestore(),APP='my-boq-app',R=`${APP}/root`;
let fail=0;const check=(ok,what)=>{console.log(`${ok?'  ✓':'  ✗'} ${what}`);if(!ok)fail++;};
const run=(script,...args)=>{const r=spawnSync(process.execPath,[`tools/security/${script}`,'--project',projectId,...args],{encoding:'utf8',env:process.env});
 console.log(`\n$ node tools/security/${script} ${args.join(' ')}\n${(r.stdout+r.stderr).trim().replace(/^/gm,'  | ')}`);return r;};
const state=async()=>{
 const cfg=(await db.doc(`${R}/apiProviders/config`).get()).data();
 const secrets=Object.fromEntries((await db.collection(`${R}/apiProviderSecrets`).get()).docs.map(d=>[d.id,d.data().apiKey]));
 const central=(await db.collection(`${R}/elementTemplates`).get()).docs.map(d=>`${d.id}:${d.data().scope}:v${d.data().version}`).sort();
 const proj={};for(const p of ['pA','pB'])proj[p]=(await db.collection(`projects/${p}/elementTemplates`).get()).docs.map(d=>`${d.id}:v${d.data().version}${d.data().origin?.migratedFrom?' (migrated)':''}`).sort();
 return {config:Object.fromEntries(Object.entries(cfg.providers).map(([k,v])=>[k,v.apiKey?'KEY IN CONFIG':(v.hasApiKey?'hasApiKey':'-')])),secrets:Object.keys(secrets).sort(),central,proj};
};
const show=(t,s)=>console.log(`\n== ${t}\n${JSON.stringify(s,null,1)}`);
// seed (fake keys)
await db.doc(`${R}/apiProviders/config`).set({updatedAt:admin.firestore.Timestamp.fromMillis(1760000000123),active:'openai',providers:{openai:{model:'m1',apiKey:'sk-fake-openai'},anthropic:{model:'m2',apiKey:'sk-fake-anthropic'},'google-ai-studio':{model:'m3'}}});
const tpl=(id,scope,pid,v,name)=>db.doc(`${R}/elementTemplates/${id}`).set({id,scope,...(pid?{projectId:pid,projectCode:pid.toUpperCase()}:{}),name,version:v,category:'Foundation',payload:{}});
await tpl('t1','project','pA',2,'F-01 standard');await tpl('t2','project','pB',1,'W1 tank wall');await tpl('t3','workspace','',1,'central footing');await tpl('t4','project','pA',1,'old copy');
await db.doc('projects/pA/elementTemplates/t4').set({id:'t4',scope:'project',projectId:'pA',name:'old copy',version:3});
const before=await state();show('before',before);
// 1. dry runs write nothing
run('migrateApiKeys.mjs');run('migrateElementTemplates.mjs');
check(JSON.stringify(await state())===JSON.stringify(before),'dry runs wrote nothing');
// 2. --apply without --backup refused
const r0=run('migrateApiKeys.mjs','--apply');check(r0.status===1&&JSON.stringify(await state())===JSON.stringify(before),'--apply without --backup refused, nothing written');
// 3. apply with a backup
const dir=mkdtempSync(join(tmpdir(),'boq-migrate-'));
run('migrateApiKeys.mjs','--apply','--backup',dir);run('migrateElementTemplates.mjs','--apply','--backup',dir);
const after=await state();show('after',after);
check(Object.values(after.config).every(v=>v!=='KEY IN CONFIG')&&after.secrets.join()==='anthropic,openai','keys moved to apiProviderSecrets, none left in the config');
check(after.central.join()==='t3:workspace:v1','only the workspace template stays central');
check(after.proj.pA.join()==='t1:v2 (migrated),t4:v3'&&after.proj.pB.join()==='t2:v1 (migrated)','project templates copied (newer existing copy t4 kept)');
const files=readdirSync(dir);check(files.length===2,`backups written: ${files.join(', ')}`);
// 4. second run: nothing to do
run('migrateApiKeys.mjs','--apply','--backup',dir);run('migrateElementTemplates.mjs','--apply','--backup',dir);
check(JSON.stringify(await state())===JSON.stringify(after),'second run changed nothing');
// 5. rollback from the backups
for(const f of files.filter(f=>f.endsWith('.json')).sort()){run('restoreBackup.mjs','--file',join(dir,f));run('restoreBackup.mjs','--file',join(dir,f),'--apply');}
const back=await state();show('after rollback',back);
check(JSON.stringify(back.config)===JSON.stringify(before.config)&&JSON.stringify(back.central)===JSON.stringify(before.central)&&JSON.stringify(back.proj)===JSON.stringify(before.proj)&&back.secrets.length===0,'rollback restored config, central templates, project templates and removed the new secrets');
const cfgBack=(await db.doc(`${R}/apiProviders/config`).get()).data().updatedAt;check(cfgBack instanceof admin.firestore.Timestamp&&cfgBack.toMillis()===1760000000123,'Timestamp field restored as a Timestamp');
const k=JSON.parse(readFileSync(join(dir,files.find(f=>f.startsWith('migrateApiKeys'))),'utf8'));check(k.docs.length===3,'key backup holds the config + 2 secret paths');
console.log(fail?`\n${fail} check(s) failed`:'\nall checks passed');process.exit(fail?1:0);
