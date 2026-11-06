// Rollback of a migration run: puts every document of a backup file (written by migrateApiKeys / migrateElementTemplates with
// --apply --backup) back as it was — documents that did not exist before are deleted, the others are overwritten with the
// saved data. Dry run by default; `--apply` writes.
//   node tools/security/restoreBackup.mjs --project my-boq-app --file <backup.json> [--apply]
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {decode} from './backup.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const arg=(n,d)=>{const i=process.argv.indexOf(`--${n}`);return i>0?process.argv[i+1]:d;};
const apply=process.argv.includes('--apply'),projectId=arg('project'),file=arg('file');
if(!projectId||!file){console.error('--project <id> and --file <backup.json> are required');process.exit(1);}
const b=JSON.parse(readFileSync(file,'utf8'));
if(b.project&&b.project!==projectId){console.error(`backup is of project ${b.project}, not ${projectId}`);process.exit(1);}
admin.initializeApp({projectId});
const db=admin.firestore();
console.log(`${apply?'APPLY':'DRY RUN'} · restore ${b.docs.length} document(s) from ${file} (${b.script}, ${b.at})`);
const batch=db.batch();
for(const d of b.docs){console.log(`  ${d.path}: ${d.exists?'put back the saved data':'delete (did not exist before)'}`);
 if(d.exists)batch.set(db.doc(d.path),decode(d.data,admin.firestore.Timestamp));else batch.delete(db.doc(d.path));}
if(apply){await batch.commit();console.log('restored');}
